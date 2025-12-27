import { describe, it, expect } from 'vitest';
import {
  buildContextEnvelope, renderContextIndex, renderChunk, renderChunks,
  renderAttachments, renderEnvelopeAsText, getAttachmentData, getEnvelopeStats, estimateTokens,
} from '../../src/main/services/context/context-ir-builder';
import type { WebpageSource, PdfSource, ImageSource, NoteSource, ChatlogSource, Source, ContextChunk } from '../../src/types/context-ir';

// Fixtures
const webpageSource: WebpageSource = {
  kind: 'webpage', source_id: 'src:12345678', title: 'Example Article',
  url: 'https://example.com/article', captured_at: Date.now(),
  markdown: '# Introduction\n\nThis is an example article.', extraction_type: 'article', quality: 'good',
};

const webpageWithScreenshot: WebpageSource = {
  ...webpageSource, source_id: 'src:abcd1234',
  screenshot: { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAA', mime_type: 'image/png', byte_size: 1024 },
};

const pdfSource: PdfSource = {
  kind: 'pdf', source_id: 'src:87654321', title: 'Q3 Report', url: 'file:///q3.pdf', captured_at: Date.now(),
  pages: [
    { page_number: 1, text: 'Executive Summary' },
    { page_number: 2, text: 'Details' },
    { page_number: 3, text: 'Charts', image: { data: 'base64', mime_type: 'image/png', byte_size: 2048 } },
  ],
};

const imageSource: ImageSource = {
  kind: 'image', source_id: 'src:11111111', title: 'Diagram', captured_at: Date.now(),
  image: { data: 'imgdata', mime_type: 'image/png', byte_size: 5000 }, alt_text: 'System architecture',
};

const noteSource: NoteSource = {
  kind: 'note', source_id: 'src:22222222', title: 'Notes', captured_at: Date.now(),
  text: 'Key decisions:\n1. Adopt new framework',
};

const chatlogSource: ChatlogSource = {
  kind: 'chatlog', source_id: 'src:33333333', title: 'Conversation', captured_at: Date.now(),
  messages: [{ index: 0, role: 'user', content: 'Hello' }, { index: 1, role: 'assistant', content: 'Hi!' }],
};

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

describe('buildContextEnvelope', () => {
  it('builds envelope with index, chunks, attachments, and budget', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Summarize');
    expect(envelope.version).toBe('1.0');
    expect(envelope.sources).toHaveLength(1);
    expect(envelope.index.entries).toHaveLength(1);
    expect(envelope.chunks.length).toBeGreaterThan(0);
    expect(envelope.budget.used_tokens).toBeGreaterThan(0);
    expect(envelope.task).toBe('Summarize');
  });

  it('builds chunks for each source type', () => {
    const sources: Source[] = [webpageSource, pdfSource, noteSource, chatlogSource, imageSource];
    const envelope = buildContextEnvelope(sources, 'Analyze');
    expect(envelope.chunks.length).toBeGreaterThanOrEqual(5); // webpage + 3 pdf pages + note + chatlog + image
  });

  it('creates one chunk per PDF page', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Review');
    expect(envelope.chunks).toHaveLength(3);
    expect(envelope.chunks[0].anchor).toBe('src:87654321#p=1');
    expect(envelope.chunks[2].anchor).toBe('src:87654321#p=3');
  });

  it('includes pages_attached in index for PDFs with images', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Review');
    expect(envelope.index.entries[0].pages_attached).toEqual([3]);
  });

  it('builds attachment manifest for images and screenshots', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot, imageSource], 'Describe');
    expect(envelope.attachments).toHaveLength(2);
    expect(envelope.attachments.map(a => a.artifact_type)).toContain('screenshot');
    expect(envelope.attachments.map(a => a.artifact_type)).toContain('raw_image');
  });

  it('excludes attachments when option is false', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot], 'Test', { includeAttachments: false });
    expect(envelope.attachments).toHaveLength(0);
  });

  it('handles empty sources', () => {
    const envelope = buildContextEnvelope([], 'Hello');
    expect(envelope.sources).toHaveLength(0);
    expect(envelope.chunks).toHaveLength(0);
  });

  it('skips chunks for empty content', () => {
    const empty: WebpageSource = { ...webpageSource, source_id: 'src:empty123', markdown: '' };
    expect(buildContextEnvelope([empty], 'Test').chunks).toHaveLength(0);
  });

  it('skips chunks for image without alt_text', () => {
    const noAlt: ImageSource = { ...imageSource, alt_text: undefined };
    const envelope = buildContextEnvelope([noAlt], 'Test');
    expect(envelope.chunks).toHaveLength(0);
    expect(envelope.attachments).toHaveLength(1);
  });
});

describe('renderContextIndex', () => {
  it('renders empty index', () => {
    expect(renderContextIndex({ entries: [] })).toContain('(no sources)');
  });

  it('renders entries with numbering, type, title, and URL', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    const result = renderContextIndex(envelope.index);
    expect(result).toMatch(/\[1\].*src:12345678.*webpage.*"Example Article".*https:\/\/example\.com/);
  });
});

describe('renderChunk', () => {
  it('renders chunk with header and content', () => {
    const chunk: ContextChunk = {
      anchor: 'src:12345678', source_id: 'src:12345678', source_type: 'webpage',
      title: 'Test', url: 'https://test.com', extraction_method: 'readability_v1',
      quality: 'good', content: 'Content here.', token_count: 5,
    };
    const result = renderChunk(chunk);
    expect(result).toContain('[CHUNK]');
    expect(result).toContain('anchor: src:12345678');
    expect(result).toContain('Content here.');
    expect(result).toContain('[/CHUNK]');
  });

  it('indicates truncated status', () => {
    const chunk: ContextChunk = {
      anchor: 'src:12345678', source_id: 'src:12345678', source_type: 'note',
      title: 'Test', extraction_method: 'note_v1', content: 'Partial...', token_count: 2, truncated: true,
    };
    expect(renderChunk(chunk)).toContain('[truncated]');
  });
});

describe('renderChunks', () => {
  it('renders multiple chunks with section header', () => {
    const envelope = buildContextEnvelope([webpageSource, noteSource], 'Test');
    const result = renderChunks(envelope.chunks);
    expect(result).toContain('=== CONTENT ===');
    expect((result.match(/\[CHUNK\]/g) || []).length).toBe(2);
  });
});

describe('renderAttachments', () => {
  it('renders manifest with type, mime, and size', () => {
    const envelope = buildContextEnvelope([imageSource], 'Test');
    const result = renderAttachments(envelope.attachments);
    expect(result).toContain('raw_image');
    expect(result).toContain('image/png');
    expect(result).toContain('4.9KB');
  });

  it('only renders included attachments', () => {
    const result = renderAttachments([
      { anchor: 'src:a', source_id: 'src:a', artifact_type: 'raw_image', mime_type: 'image/png', byte_size: 100, included: true },
      { anchor: 'src:b', source_id: 'src:b', artifact_type: 'screenshot', mime_type: 'image/png', byte_size: 200, included: false },
    ]);
    expect(result).toContain('src:a');
    expect(result).not.toContain('src:b');
  });
});

describe('renderEnvelopeAsText', () => {
  it('includes all sections: index, content, attachments, task', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot], 'Summarize');
    const result = renderEnvelopeAsText(envelope);
    expect(result).toContain('=== CONTEXT INDEX ===');
    expect(result).toContain('=== CONTENT ===');
    expect(result).toContain('=== ATTACHMENTS ===');
    expect(result).toContain('=== TASK ===');
    expect(result).toContain('Summarize');
  });

  it('includes cite instruction when chunks exist', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    expect(renderEnvelopeAsText(envelope)).toContain('cite using the anchor format');
  });

  it('omits attachments section when none exist', () => {
    const envelope = buildContextEnvelope([noteSource], 'Test');
    expect(renderEnvelopeAsText(envelope)).not.toContain('=== ATTACHMENTS ===');
  });
});

describe('getAttachmentData', () => {
  it('retrieves screenshot from webpage', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot], 'Test');
    const data = getAttachmentData(envelope, 'src:abcd1234');
    expect(data?.mime_type).toBe('image/png');
  });

  it('retrieves page image from PDF by anchor', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Test');
    const data = getAttachmentData(envelope, 'src:87654321#p=3');
    expect(data?.byte_size).toBe(2048);
  });

  it('returns undefined for non-existent anchor', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    expect(getAttachmentData(envelope, 'src:nonexistent')).toBeUndefined();
  });
});

describe('getEnvelopeStats', () => {
  it('returns counts by source type', () => {
    const sources: Source[] = [webpageSource, pdfSource, noteSource, imageSource];
    const stats = getEnvelopeStats(buildContextEnvelope(sources, 'Analyze'));
    expect(stats.sourceCount).toBe(4);
    expect(stats.sourcesByType.webpage).toBe(1);
    expect(stats.sourcesByType.pdf).toBe(1);
  });
});
