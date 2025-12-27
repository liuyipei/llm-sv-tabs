import { describe, it, expect } from 'vitest';
import {
  buildQueryContext,
  buildSourcesFromExtracted,
  estimateQueryTokens,
  shouldUseContextIR,
} from '../../src/main/services/context/query-context-builder';
import type { ExtractedContent, ContextTabInfo } from '../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const htmlContent: ExtractedContent = {
  type: 'html',
  title: 'Example Article',
  url: 'https://example.com/article',
  content: 'This is the main content of the article about testing.',
  metadata: {
    extractionType: 'article',
  },
};

const pdfContent: ExtractedContent = {
  type: 'pdf',
  title: 'Q3 Report',
  url: 'file:///reports/q3.pdf',
  content: '--- Page 1 ---\nExecutive Summary\n\n--- Page 2 ---\nDetails',
};

const imageContent: ExtractedContent = {
  type: 'image',
  title: 'Architecture Diagram',
  url: 'file:///images/arch.png',
  content: 'System architecture overview',
  imageData: {
    data: 'data:image/png;base64,iVBORw0KGgo=',
    mimeType: 'image/png',
  },
};

const textContent: ExtractedContent = {
  type: 'text',
  title: 'My Notes',
  url: 'note://1',
  content: 'Important meeting notes about the project.',
};

const mockTabInfos: ContextTabInfo[] = [
  { id: 'tab-1', title: 'Article', url: 'https://example.com', type: 'webpage' },
  { id: 'tab-2', title: 'Report', url: 'file:///q3.pdf', type: 'pdf' },
  { id: 'tab-3', title: 'Diagram', url: 'file:///arch.png', type: 'upload' },
  { id: 'tab-4', title: 'Notes', url: 'note://1', type: 'notes' },
];

// ============================================================================
// buildQueryContext Tests
// ============================================================================

describe('buildQueryContext', () => {
  it('should build context from single extracted content', () => {
    const result = buildQueryContext(
      [htmlContent],
      [mockTabInfos[0]],
      'Summarize this article'
    );

    expect(result.text).toContain('=== CONTEXT INDEX ===');
    expect(result.text).toContain('=== CONTENT ===');
    expect(result.text).toContain('=== TASK ===');
    expect(result.text).toContain('Summarize this article');
    expect(result.sources).toHaveLength(1);
    expect(result.envelope.task).toBe('Summarize this article');
  });

  it('should build context from multiple extracted contents', () => {
    const contents = [htmlContent, pdfContent, textContent];
    const tabInfos = [mockTabInfos[0], mockTabInfos[1], mockTabInfos[3]];

    const result = buildQueryContext(contents, tabInfos, 'Analyze all');

    expect(result.sources).toHaveLength(3);
    expect(result.stats.sourceCount).toBe(3);
    expect(result.text).toContain('Example Article');
    expect(result.text).toContain('Q3 Report');
    expect(result.text).toContain('My Notes');
  });

  it('should include citation instructions in rendered text', () => {
    const result = buildQueryContext(
      [htmlContent],
      [mockTabInfos[0]],
      'What does it say?'
    );

    expect(result.text).toContain('cite using the anchor format');
    expect(result.text).toMatch(/src:[a-f0-9]{8}/);
  });

  it('should track statistics correctly', () => {
    const result = buildQueryContext(
      [htmlContent, pdfContent],
      [mockTabInfos[0], mockTabInfos[1]],
      'Compare'
    );

    expect(result.stats.sourceCount).toBe(2);
    expect(result.stats.chunkCount).toBeGreaterThan(0);
    expect(result.stats.estimatedTokens).toBeGreaterThan(0);
  });

  it('should handle empty content array', () => {
    const result = buildQueryContext([], [], 'Hello world');

    expect(result.sources).toHaveLength(0);
    expect(result.stats.sourceCount).toBe(0);
    expect(result.text).toContain('(no sources)');
    expect(result.text).toContain('Hello world');
  });

  it('should preserve source order in envelope', () => {
    const contents = [htmlContent, pdfContent, textContent];
    const tabInfos = [mockTabInfos[0], mockTabInfos[1], mockTabInfos[3]];

    const result = buildQueryContext(contents, tabInfos, 'Review');

    expect(result.envelope.sources[0].title).toBe('Example Article');
    expect(result.envelope.sources[1].title).toBe('Q3 Report');
    expect(result.envelope.sources[2].title).toBe('My Notes');
  });

  it('should handle image content with alt text', () => {
    const result = buildQueryContext(
      [imageContent],
      [mockTabInfos[2]],
      'Describe the image'
    );

    expect(result.sources).toHaveLength(1);
    expect(result.envelope.chunks).toHaveLength(1);
    expect(result.envelope.chunks[0].content).toBe('System architecture overview');
    expect(result.envelope.attachments).toHaveLength(1);
  });
});

// ============================================================================
// buildSourcesFromExtracted Tests
// ============================================================================

describe('buildSourcesFromExtracted', () => {
  it('should build sources matching tab info indices', () => {
    const contents = [htmlContent, textContent];
    const tabInfos = [mockTabInfos[0], mockTabInfos[3]];

    const sources = buildSourcesFromExtracted(contents, tabInfos);

    expect(sources).toHaveLength(2);
    expect(sources[0].tab_id).toBe('tab-1');
    expect(sources[1].tab_id).toBe('tab-4');
  });

  it('should create default tab info when not provided', () => {
    const sources = buildSourcesFromExtracted([htmlContent], []);

    expect(sources).toHaveLength(1);
    expect(sources[0].tab_id).toBe('tab-0');
    expect(sources[0].title).toBe('Example Article');
  });

  it('should handle partial tab info array', () => {
    const contents = [htmlContent, textContent, pdfContent];
    const tabInfos = [mockTabInfos[0]]; // Only one tab info

    const sources = buildSourcesFromExtracted(contents, tabInfos);

    expect(sources).toHaveLength(3);
    expect(sources[0].tab_id).toBe('tab-1'); // From provided info
    expect(sources[1].tab_id).toBe('tab-1'); // Default
    expect(sources[2].tab_id).toBe('tab-2'); // Default
  });

  it('should map content types to correct source kinds', () => {
    const contents = [htmlContent, pdfContent, imageContent, textContent];
    const sources = buildSourcesFromExtracted(contents, []);

    expect(sources[0].kind).toBe('webpage');
    expect(sources[1].kind).toBe('pdf');
    expect(sources[2].kind).toBe('image');
    expect(sources[3].kind).toBe('note');
  });
});

// ============================================================================
// estimateQueryTokens Tests
// ============================================================================

describe('estimateQueryTokens', () => {
  it('should estimate tokens for task alone', () => {
    const tokens = estimateQueryTokens([], 'Hello world');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should include content in token estimate', () => {
    const tokensWithContent = estimateQueryTokens([htmlContent], 'Summarize');
    const tokensWithoutContent = estimateQueryTokens([], 'Summarize');

    expect(tokensWithContent).toBeGreaterThan(tokensWithoutContent);
  });

  it('should handle SerializedDOM content', () => {
    const domContent: ExtractedContent = {
      type: 'html',
      title: 'Test',
      url: 'https://test.com',
      content: {
        title: 'Test',
        url: 'https://test.com',
        headings: [],
        paragraphs: [],
        links: [],
        mainContent: 'This is the main content.',
        metaTags: {},
      },
    };

    const tokens = estimateQueryTokens([domContent], 'Analyze');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle PDFContent', () => {
    const pdfContentObj: ExtractedContent = {
      type: 'pdf',
      title: 'PDF',
      url: 'file:///test.pdf',
      content: {
        text: 'PDF text content here.',
        numPages: 1,
      },
    };

    const tokens = estimateQueryTokens([pdfContentObj], 'Review');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should accumulate tokens across multiple contents', () => {
    const tokens1 = estimateQueryTokens([htmlContent], 'Task');
    const tokens2 = estimateQueryTokens([textContent], 'Task');
    const tokensBoth = estimateQueryTokens([htmlContent, textContent], 'Task');

    // Combined should be roughly sum of individual (minus duplicate task)
    expect(tokensBoth).toBeLessThanOrEqual(tokens1 + tokens2);
  });
});

// ============================================================================
// shouldUseContextIR Tests
// ============================================================================

describe('shouldUseContextIR', () => {
  it('should return true by default', () => {
    const result = shouldUseContextIR([htmlContent]);
    expect(result).toBe(true);
  });

  it('should return true for any content type', () => {
    expect(shouldUseContextIR([htmlContent])).toBe(true);
    expect(shouldUseContextIR([pdfContent])).toBe(true);
    expect(shouldUseContextIR([imageContent])).toBe(true);
    expect(shouldUseContextIR([textContent])).toBe(true);
  });

  it('should return true regardless of provider', () => {
    expect(shouldUseContextIR([htmlContent], { provider: 'openai' })).toBe(true);
    expect(shouldUseContextIR([htmlContent], { provider: 'anthropic' })).toBe(true);
    expect(shouldUseContextIR([htmlContent], { provider: 'gemini' })).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration', () => {
  it('should produce consistent output for same input', () => {
    const result1 = buildQueryContext([htmlContent], [mockTabInfos[0]], 'Test');
    const result2 = buildQueryContext([htmlContent], [mockTabInfos[0]], 'Test');

    // Source IDs should be consistent
    expect(result1.sources[0].source_id).toBe(result2.sources[0].source_id);
  });

  it('should handle mixed content types in single query', () => {
    const contents = [htmlContent, pdfContent, imageContent, textContent];
    const result = buildQueryContext(contents, mockTabInfos, 'Analyze everything');

    expect(result.sources).toHaveLength(4);
    expect(result.envelope.index.entries).toHaveLength(4);

    // Each source type should be represented
    const kinds = result.sources.map((s) => s.kind);
    expect(kinds).toContain('webpage');
    expect(kinds).toContain('pdf');
    expect(kinds).toContain('image');
    expect(kinds).toContain('note');
  });

  it('should render usable context for LLM consumption', () => {
    const result = buildQueryContext(
      [htmlContent],
      [mockTabInfos[0]],
      'What is the main topic?'
    );

    // Should have clear structure
    expect(result.text).toContain('=== CONTEXT INDEX ===');
    expect(result.text).toContain('=== CONTENT ===');
    expect(result.text).toContain('=== TASK ===');

    // Should include actual content
    expect(result.text).toContain('testing');

    // Should include the task
    expect(result.text).toContain('What is the main topic?');
  });
});
