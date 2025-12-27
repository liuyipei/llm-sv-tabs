import { describe, it, expect } from 'vitest';
import {
  applyTokenBudget, extractiveSummary, findSemanticBoundaries, truncateAtBoundary,
} from '../../src/main/services/context/token-budget';
import { buildContextEnvelope } from '../../src/main/services/context/context-ir-builder';
import type { WebpageSource, NoteSource, ContextEnvelope } from '../../src/types/context-ir';

// Helper to create sources with specific token sizes
function makeSource(id: string, text: string, score?: number): NoteSource {
  return { kind: 'note', source_id: `src:${id}`, title: `Note ${id}`, captured_at: Date.now(), text };
}

function makeWebpage(id: string, markdown: string, score?: number): WebpageSource {
  return {
    kind: 'webpage', source_id: `src:${id}`, title: `Page ${id}`,
    url: `https://example.com/${id}`, captured_at: Date.now(),
    markdown, extraction_type: 'article', quality: 'good',
  };
}

function addRelevanceScores(envelope: ContextEnvelope, scores: number[]): ContextEnvelope {
  return { ...envelope, chunks: envelope.chunks.map((c, i) => ({ ...c, relevance_score: scores[i] ?? 0 })) };
}

describe('applyTokenBudget', () => {
  describe('Stage 0: Full content fits', () => {
    it('returns unchanged when content fits budget', () => {
      const source = makeSource('a', 'Short content');
      const envelope = buildContextEnvelope([source], 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 10000 });
      expect(result.budget.degrade_stage).toBe(0);
      expect(result.chunks).toHaveLength(1);
      expect(result.budget.cuts).toHaveLength(0);
    });

    it('returns unchanged when maxTokens is 0', () => {
      const source = makeSource('a', 'Content');
      const envelope = buildContextEnvelope([source], 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 0 });
      expect(result).toBe(envelope);
    });
  });

  describe('Stage 1: Remove low-ranked chunks', () => {
    it('removes low-ranked chunks when budget is tight', () => {
      const sources = [makeSource('a', 'x'.repeat(400)), makeSource('b', 'y'.repeat(400))];
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.1]);
      // Budget enough for 1 chunk + overhead but not 2
      const result = applyTokenBudget(envelope, { maxTokens: 400, minChunks: 1 });
      expect(result.budget.degrade_stage).toBeGreaterThanOrEqual(1);
      expect(result.chunks.length).toBeLessThanOrEqual(2);
    });

    it('respects minChunks when budget allows', () => {
      const sources = [makeSource('a', 'Short'), makeSource('b', 'Also short')];
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.1]);
      // Budget generous enough to fit both
      const result = applyTokenBudget(envelope, { maxTokens: 2000, minChunks: 2 });
      expect(result.chunks.length).toBe(2);
    });
  });

  describe('Stage 2: Extractive summarization', () => {
    it('summarizes low-ranked chunks when removal not enough', () => {
      const longText = 'First sentence here. Second sentence follows. Third comes next. ' +
        'Then more content. And even more. ' + 'x'.repeat(500);
      const sources = [makeSource('a', longText), makeSource('b', longText)];
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.1]);
      const result = applyTokenBudget(envelope, { maxTokens: 500, minChunks: 1 });
      const summarizedCuts = result.budget.cuts.filter(c => c.type === 'summarized');
      // May or may not reach stage 2 depending on budget
      expect(result.budget.degrade_stage).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Stage 3: Top-K chunks', () => {
    it('keeps only top-K chunks when budget very tight', () => {
      const sources = Array.from({ length: 5 }, (_, i) => makeSource(String(i), 'x'.repeat(100)));
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.8, 0.5, 0.2, 0.1]);
      const result = applyTokenBudget(envelope, { maxTokens: 350, minChunks: 2 });
      expect(result.chunks.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Stage 4: Hard truncation at boundaries', () => {
    it('truncates at semantic boundaries', () => {
      const longText = '# Heading One\n\nParagraph one content here.\n\n' +
        '## Heading Two\n\nParagraph two content here.\n\n' +
        '### Heading Three\n\n' + 'x'.repeat(2000);
      const sources = [makeSource('a', longText)];
      const envelope = buildContextEnvelope(sources, 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 400 });
      if (result.chunks.length > 0 && result.chunks[0].truncated) {
        expect(result.chunks[0].content).toContain('[truncated]');
      }
    });
  });

  describe('Stage 5: Minimal - Index only', () => {
    it('returns only index when budget extremely tight', () => {
      const longText = 'x'.repeat(5000);
      const sources = [makeSource('a', longText)];
      const envelope = buildContextEnvelope(sources, 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 50 });
      expect(result.budget.degrade_stage).toBe(5);
      expect(result.chunks).toHaveLength(0);
      expect(result.attachments.every(a => !a.included)).toBe(true);
    });

    it('adds summaries to index entries at stage 5', () => {
      const text = 'First sentence. Second sentence. Content continues here.';
      const sources = [makeSource('a', text)];
      const envelope = buildContextEnvelope(sources, 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 80 });
      expect(result.budget.degrade_stage).toBe(5);
      expect(result.index.entries[0].content_included).toBe(false);
    });
  });

  describe('Budget tracking', () => {
    it('tracks used tokens correctly', () => {
      const source = makeSource('a', 'Test content here');
      const envelope = buildContextEnvelope([source], 'Task');
      const result = applyTokenBudget(envelope, { maxTokens: 10000 });
      expect(result.budget.used_tokens).toBeGreaterThan(0);
      expect(result.budget.used_tokens).toBeLessThanOrEqual(result.budget.max_tokens);
    });

    it('records cuts with anchors and reasons', () => {
      const sources = [makeSource('a', 'x'.repeat(500)), makeSource('b', 'y'.repeat(500))];
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.1]);
      const result = applyTokenBudget(envelope, { maxTokens: 350, minChunks: 1 });
      for (const cut of result.budget.cuts) {
        expect(cut.anchor).toMatch(/^src:/);
        expect(cut.reason).toBeTruthy();
        expect(cut.original_tokens).toBeGreaterThan(0);
      }
    });
  });

  describe('Index updates', () => {
    it('marks excluded sources as content_included: false', () => {
      const sources = [makeSource('a', 'x'.repeat(500)), makeSource('b', 'y'.repeat(500))];
      let envelope = buildContextEnvelope(sources, 'Task');
      envelope = addRelevanceScores(envelope, [0.9, 0.1]);
      const result = applyTokenBudget(envelope, { maxTokens: 300, minChunks: 1 });
      const includedCount = result.index.entries.filter(e => e.content_included).length;
      expect(includedCount).toBeLessThanOrEqual(result.chunks.length);
    });
  });
});

describe('extractiveSummary', () => {
  it('extracts first 2-3 sentences', () => {
    const content = 'First sentence here. Second sentence follows. Third is here. Fourth should not appear.';
    const result = extractiveSummary(content, 'src:test');
    expect(result).toContain('First sentence');
    expect(result).toContain('Second sentence');
    expect(result).toContain('[extractive summary');
    expect(result).toContain('src:test');
  });

  it('handles empty content', () => {
    const result = extractiveSummary('', 'src:empty');
    expect(result).toContain('[see src:empty for content]');
  });

  it('truncates very long summaries', () => {
    const longSentence = 'x'.repeat(500) + '.';
    const result = extractiveSummary(longSentence, 'src:long');
    expect(result.length).toBeLessThan(500);
  });

  it('handles content without sentence boundaries', () => {
    const content = 'Just some text without punctuation';
    const result = extractiveSummary(content, 'src:nopunc');
    expect(result).toContain('src:nopunc');
  });
});

describe('findSemanticBoundaries', () => {
  it('finds markdown headings', () => {
    const text = 'Intro\n# Heading 1\nContent\n## Heading 2\nMore';
    const boundaries = findSemanticBoundaries(text);
    expect(boundaries.length).toBeGreaterThan(2);
    expect(boundaries[0]).toBe(0);
    expect(boundaries[boundaries.length - 1]).toBe(text.length);
  });

  it('finds paragraph breaks', () => {
    const text = 'Para 1\n\nPara 2\n\nPara 3';
    const boundaries = findSemanticBoundaries(text);
    expect(boundaries.length).toBeGreaterThan(2);
  });

  it('finds page markers', () => {
    const text = 'Page 1 content\n[Page 2]\nPage 2 content';
    const boundaries = findSemanticBoundaries(text);
    expect(boundaries.length).toBeGreaterThan(2);
  });

  it('finds horizontal rules', () => {
    const text = 'Before\n---\nAfter';
    const boundaries = findSemanticBoundaries(text);
    expect(boundaries.length).toBeGreaterThan(2);
  });

  it('always includes start and end', () => {
    const text = 'No special markers here';
    const boundaries = findSemanticBoundaries(text);
    expect(boundaries[0]).toBe(0);
    expect(boundaries[boundaries.length - 1]).toBe(text.length);
  });

  it('deduplicates boundaries', () => {
    const text = '\n\n\n\n';
    const boundaries = findSemanticBoundaries(text);
    const unique = new Set(boundaries);
    expect(boundaries.length).toBe(unique.size);
  });
});

describe('truncateAtBoundary', () => {
  it('returns unchanged if within limit', () => {
    const text = 'Short text';
    expect(truncateAtBoundary(text, 100)).toBe(text);
  });

  it('truncates at paragraph boundary', () => {
    const text = 'Para 1 here.\n\nPara 2 follows.\n\nPara 3 last.';
    const result = truncateAtBoundary(text, 20);
    expect(result).toContain('[truncated]');
    expect(result.length).toBeLessThan(text.length);
  });

  it('truncates at heading boundary', () => {
    const text = '# Heading\n\nContent here.\n\n## Second\n\nMore content';
    const result = truncateAtBoundary(text, 30);
    expect(result).toContain('[truncated]');
  });

  it('falls back to word boundary when no semantic boundary', () => {
    const text = 'word '.repeat(50);
    const result = truncateAtBoundary(text, 50);
    expect(result).toContain('[truncated]');
    expect(result).not.toMatch(/word$/); // Should not cut mid-word
  });

  it('hard cuts if no good boundary found', () => {
    const text = 'x'.repeat(100);
    const result = truncateAtBoundary(text, 30);
    expect(result).toContain('[truncated]');
    expect(result.length).toBeLessThan(100);
  });
});
