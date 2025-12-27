import { describe, it, expect } from 'vitest';
import {
  buildContextEnvelope,
  renderContextIndex,
  renderChunk,
  renderChunks,
  renderAttachments,
  renderEnvelopeAsText,
  getAttachmentData,
  getEnvelopeStats,
  estimateTokens,
} from '../../src/main/services/context/context-ir-builder';
import type {
  WebpageSource,
  PdfSource,
  ImageSource,
  NoteSource,
  ChatlogSource,
  Source,
  ContextChunk,
  AttachmentManifest,
  ContextEnvelope,
} from '../../src/types/context-ir';

// ============================================================================
// Test Fixtures
// ============================================================================

const webpageSource: WebpageSource = {
  kind: 'webpage',
  source_id: 'src:12345678',
  title: 'Example Article',
  url: 'https://example.com/article',
  captured_at: Date.now(),
  markdown: '# Introduction\n\nThis is an example article about testing.',
  extraction_type: 'article',
  quality: 'good',
};

const webpageWithScreenshot: WebpageSource = {
  ...webpageSource,
  source_id: 'src:abcd1234',
  screenshot: {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
    mime_type: 'image/png',
    byte_size: 1024,
  },
};

const pdfSource: PdfSource = {
  kind: 'pdf',
  source_id: 'src:87654321',
  title: 'Q3 Financial Report',
  url: 'file:///reports/q3.pdf',
  captured_at: Date.now(),
  pages: [
    { page_number: 1, text: 'Executive Summary\n\nRevenue increased 15%.' },
    { page_number: 2, text: 'Detailed Analysis\n\nThis section covers...' },
    {
      page_number: 3,
      text: 'Charts and Graphs',
      image: { data: 'base64data', mime_type: 'image/png', byte_size: 2048 },
    },
  ],
};

const imageSource: ImageSource = {
  kind: 'image',
  source_id: 'src:11111111',
  title: 'Architecture Diagram',
  captured_at: Date.now(),
  image: { data: 'imgdata', mime_type: 'image/png', byte_size: 5000 },
  alt_text: 'System architecture showing microservices',
};

const noteSource: NoteSource = {
  kind: 'note',
  source_id: 'src:22222222',
  title: 'Meeting Notes',
  captured_at: Date.now(),
  text: 'Key decisions:\n1. Adopt new framework\n2. Migrate database',
};

const chatlogSource: ChatlogSource = {
  kind: 'chatlog',
  source_id: 'src:33333333',
  title: 'Previous Conversation',
  captured_at: Date.now(),
  model: 'gpt-4',
  messages: [
    { index: 0, role: 'user', content: 'What is the capital of France?' },
    { index: 1, role: 'assistant', content: 'The capital of France is Paris.' },
  ],
};

// ============================================================================
// Token Estimation Tests
// ============================================================================

describe('estimateTokens', () => {
  it('should estimate tokens based on character count', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('test')).toBe(1); // 4 chars = 1 token
    expect(estimateTokens('hello world')).toBe(3); // 11 chars = ~3 tokens
    expect(estimateTokens('a'.repeat(100))).toBe(25); // 100 chars = 25 tokens
  });
});

// ============================================================================
// Context Envelope Building Tests
// ============================================================================

describe('buildContextEnvelope', () => {
  it('should build envelope from single webpage source', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Summarize this article');

    expect(envelope.version).toBe('1.0');
    expect(envelope.sources).toHaveLength(1);
    expect(envelope.task).toBe('Summarize this article');
    expect(envelope.created_at).toBeGreaterThan(0);
  });

  it('should build index entries for all sources', () => {
    const sources: Source[] = [webpageSource, pdfSource, noteSource];
    const envelope = buildContextEnvelope(sources, 'Analyze all content');

    expect(envelope.index.entries).toHaveLength(3);
    expect(envelope.index.entries[0].source_id).toBe(webpageSource.source_id);
    expect(envelope.index.entries[1].source_id).toBe(pdfSource.source_id);
    expect(envelope.index.entries[2].source_id).toBe(noteSource.source_id);
  });

  it('should include pages_attached for PDF sources', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Review the PDF');

    const pdfEntry = envelope.index.entries[0];
    expect(pdfEntry.source_type).toBe('pdf');
    expect(pdfEntry.pages_attached).toEqual([3]); // Only page 3 has an image
  });

  it('should build chunks from all sources', () => {
    const sources: Source[] = [webpageSource, pdfSource];
    const envelope = buildContextEnvelope(sources, 'Analyze');

    // Webpage = 1 chunk, PDF = 3 chunks (one per page)
    expect(envelope.chunks).toHaveLength(4);
  });

  it('should build one chunk per PDF page', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Review');

    expect(envelope.chunks).toHaveLength(3);
    expect(envelope.chunks[0].anchor).toBe('src:87654321#p=1');
    expect(envelope.chunks[1].anchor).toBe('src:87654321#p=2');
    expect(envelope.chunks[2].anchor).toBe('src:87654321#p=3');
  });

  it('should build chatlog chunks with formatted messages', () => {
    const envelope = buildContextEnvelope([chatlogSource], 'Continue the conversation');

    expect(envelope.chunks).toHaveLength(1);
    expect(envelope.chunks[0].content).toContain('**user**: What is the capital');
    expect(envelope.chunks[0].content).toContain('**assistant**: The capital of France');
  });

  it('should build attachment manifest', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot, imageSource], 'Describe');

    expect(envelope.attachments).toHaveLength(2);
    expect(envelope.attachments[0].artifact_type).toBe('screenshot');
    expect(envelope.attachments[1].artifact_type).toBe('raw_image');
  });

  it('should track token budget', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');

    expect(envelope.budget.used_tokens).toBeGreaterThan(0);
    expect(envelope.budget.degrade_stage).toBe(0);
    expect(envelope.budget.cuts).toHaveLength(0);
  });

  it('should exclude attachments when option is false', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot], 'Test', {
      includeAttachments: false,
    });

    expect(envelope.attachments).toHaveLength(0);
  });

  it('should handle empty sources array', () => {
    const envelope = buildContextEnvelope([], 'Hello');

    expect(envelope.sources).toHaveLength(0);
    expect(envelope.index.entries).toHaveLength(0);
    expect(envelope.chunks).toHaveLength(0);
    expect(envelope.attachments).toHaveLength(0);
    expect(envelope.task).toBe('Hello');
  });

  it('should handle image source with alt text', () => {
    const envelope = buildContextEnvelope([imageSource], 'Describe the diagram');

    expect(envelope.chunks).toHaveLength(1);
    expect(envelope.chunks[0].content).toBe('System architecture showing microservices');
    expect(envelope.chunks[0].extraction_method).toBe('alt_text_v1');
  });

  it('should handle image source without alt text', () => {
    const imageNoAlt: ImageSource = {
      ...imageSource,
      alt_text: undefined,
    };
    const envelope = buildContextEnvelope([imageNoAlt], 'Describe');

    expect(envelope.chunks).toHaveLength(0); // No text content
    expect(envelope.attachments).toHaveLength(1); // But attachment exists
  });
});

// ============================================================================
// Context Index Rendering Tests
// ============================================================================

describe('renderContextIndex', () => {
  it('should render empty index', () => {
    const result = renderContextIndex({ entries: [] });
    expect(result).toContain('=== CONTEXT INDEX ===');
    expect(result).toContain('(no sources)');
  });

  it('should render source entries with numbering', () => {
    const envelope = buildContextEnvelope([webpageSource, pdfSource], 'Test');
    const result = renderContextIndex(envelope.index);

    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('src:12345678');
    expect(result).toContain('src:87654321');
  });

  it('should include source type and title', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    const result = renderContextIndex(envelope.index);

    expect(result).toContain('webpage');
    expect(result).toContain('"Example Article"');
  });

  it('should include URL when present', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    const result = renderContextIndex(envelope.index);

    expect(result).toContain('https://example.com/article');
  });

  it('should include pages_attached for PDFs', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Test');
    const result = renderContextIndex(envelope.index);

    expect(result).toContain('pages attached: [3]');
  });

  it('should indicate full content included', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    const result = renderContextIndex(envelope.index);

    expect(result).toContain('full content');
  });
});

// ============================================================================
// Chunk Rendering Tests
// ============================================================================

describe('renderChunk', () => {
  it('should render chunk with header and content', () => {
    const chunk: ContextChunk = {
      anchor: 'src:12345678',
      source_id: 'src:12345678',
      source_type: 'webpage',
      title: 'Test Page',
      url: 'https://test.com',
      extraction_method: 'readability_v1',
      quality: 'good',
      content: 'This is the content.',
      token_count: 5,
    };

    const result = renderChunk(chunk);

    expect(result).toContain('[CHUNK]');
    expect(result).toContain('[/CHUNK]');
    expect(result).toContain('anchor: src:12345678');
    expect(result).toContain('source_type: webpage');
    expect(result).toContain('title: Test Page');
    expect(result).toContain('url: https://test.com');
    expect(result).toContain('extraction: readability_v1');
    expect(result).toContain('quality: good');
    expect(result).toContain('---');
    expect(result).toContain('This is the content.');
  });

  it('should indicate truncated status', () => {
    const chunk: ContextChunk = {
      anchor: 'src:12345678',
      source_id: 'src:12345678',
      source_type: 'webpage',
      title: 'Test',
      extraction_method: 'test',
      content: 'Partial...',
      token_count: 2,
      truncated: true,
    };

    const result = renderChunk(chunk);
    expect(result).toContain('status: [truncated]');
  });

  it('should omit optional fields when not present', () => {
    const chunk: ContextChunk = {
      anchor: 'src:12345678',
      source_id: 'src:12345678',
      source_type: 'note',
      title: 'Note',
      extraction_method: 'note_v1',
      content: 'Note content',
      token_count: 2,
    };

    const result = renderChunk(chunk);
    expect(result).not.toContain('url:');
    expect(result).not.toContain('quality:');
  });
});

describe('renderChunks', () => {
  it('should render multiple chunks', () => {
    const envelope = buildContextEnvelope([webpageSource, noteSource], 'Test');
    const result = renderChunks(envelope.chunks);

    expect(result).toContain('=== CONTENT ===');
    expect(result).toContain('[CHUNK]');
    expect((result.match(/\[CHUNK\]/g) || []).length).toBe(2);
  });

  it('should handle empty chunks', () => {
    const result = renderChunks([]);
    expect(result).toContain('=== CONTENT ===');
    expect(result).toContain('(no content)');
  });
});

// ============================================================================
// Attachment Rendering Tests
// ============================================================================

describe('renderAttachments', () => {
  it('should render attachment manifest', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot, imageSource], 'Test');
    const result = renderAttachments(envelope.attachments);

    expect(result).toContain('=== ATTACHMENTS ===');
    expect(result).toContain('screenshot');
    expect(result).toContain('raw_image');
    expect(result).toContain('image/png');
  });

  it('should show byte size', () => {
    const envelope = buildContextEnvelope([imageSource], 'Test');
    const result = renderAttachments(envelope.attachments);

    expect(result).toContain('4.9KB'); // 5000 bytes
  });

  it('should handle empty attachments', () => {
    const result = renderAttachments([]);
    expect(result).toContain('(no attachments)');
  });

  it('should only include attachments marked as included', () => {
    const attachments: AttachmentManifest[] = [
      {
        anchor: 'src:11111111',
        source_id: 'src:11111111',
        artifact_type: 'raw_image',
        mime_type: 'image/png',
        byte_size: 1000,
        included: true,
      },
      {
        anchor: 'src:22222222',
        source_id: 'src:22222222',
        artifact_type: 'screenshot',
        mime_type: 'image/png',
        byte_size: 2000,
        included: false, // Excluded
      },
    ];

    const result = renderAttachments(attachments);
    expect(result).toContain('src:11111111');
    expect(result).not.toContain('src:22222222');
  });
});

// ============================================================================
// Full Envelope Rendering Tests
// ============================================================================

describe('renderEnvelopeAsText', () => {
  it('should render complete envelope with all sections', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot, pdfSource], 'Analyze both');
    const result = renderEnvelopeAsText(envelope);

    expect(result).toContain('=== CONTEXT INDEX ===');
    expect(result).toContain('=== CONTENT ===');
    expect(result).toContain('=== ATTACHMENTS ===');
    expect(result).toContain('=== TASK ===');
    expect(result).toContain('Analyze both');
  });

  it('should include cite instruction', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Summarize');
    const result = renderEnvelopeAsText(envelope);

    expect(result).toContain('When referencing content');
    expect(result).toContain('cite using the anchor format');
    expect(result).toContain('src:12345678');
  });

  it('should omit attachments section when no attachments', () => {
    const envelope = buildContextEnvelope([noteSource], 'Review notes');
    const result = renderEnvelopeAsText(envelope);

    expect(result).not.toContain('=== ATTACHMENTS ===');
  });

  it('should handle minimal envelope', () => {
    const envelope = buildContextEnvelope([], 'Hello world');
    const result = renderEnvelopeAsText(envelope);

    expect(result).toContain('=== CONTEXT INDEX ===');
    expect(result).toContain('(no sources)');
    expect(result).toContain('=== TASK ===');
    expect(result).toContain('Hello world');
  });
});

// ============================================================================
// Attachment Data Retrieval Tests
// ============================================================================

describe('getAttachmentData', () => {
  it('should get screenshot from webpage', () => {
    const envelope = buildContextEnvelope([webpageWithScreenshot], 'Test');
    const data = getAttachmentData(envelope, 'src:abcd1234');

    expect(data).toBeDefined();
    expect(data?.mime_type).toBe('image/png');
    expect(data?.byte_size).toBe(1024);
  });

  it('should get page image from PDF', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Test');
    const data = getAttachmentData(envelope, 'src:87654321#p=3');

    expect(data).toBeDefined();
    expect(data?.mime_type).toBe('image/png');
    expect(data?.byte_size).toBe(2048);
  });

  it('should get raw image from image source', () => {
    const envelope = buildContextEnvelope([imageSource], 'Test');
    const data = getAttachmentData(envelope, 'src:11111111');

    expect(data).toBeDefined();
    expect(data?.mime_type).toBe('image/png');
    expect(data?.byte_size).toBe(5000);
  });

  it('should return undefined for non-existent anchor', () => {
    const envelope = buildContextEnvelope([webpageSource], 'Test');
    const data = getAttachmentData(envelope, 'src:nonexistent');

    expect(data).toBeUndefined();
  });

  it('should return undefined for non-existent page', () => {
    const envelope = buildContextEnvelope([pdfSource], 'Test');
    const data = getAttachmentData(envelope, 'src:87654321#p=99');

    expect(data).toBeUndefined();
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('getEnvelopeStats', () => {
  it('should calculate statistics correctly', () => {
    const sources: Source[] = [webpageSource, pdfSource, noteSource, imageSource];
    const envelope = buildContextEnvelope(sources, 'Analyze');
    const stats = getEnvelopeStats(envelope);

    expect(stats.sourceCount).toBe(4);
    expect(stats.chunkCount).toBe(6); // 1 webpage + 3 pdf pages + 1 note + 1 image alt_text
    expect(stats.attachmentCount).toBe(2); // 1 pdf page image + 1 raw image
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.sourcesByType.webpage).toBe(1);
    expect(stats.sourcesByType.pdf).toBe(1);
    expect(stats.sourcesByType.note).toBe(1);
    expect(stats.sourcesByType.image).toBe(1);
  });

  it('should handle empty envelope', () => {
    const envelope = buildContextEnvelope([], 'Test');
    const stats = getEnvelopeStats(envelope);

    expect(stats.sourceCount).toBe(0);
    expect(stats.chunkCount).toBe(0);
    expect(stats.attachmentCount).toBe(0);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('edge cases', () => {
  it('should handle source with empty content', () => {
    const emptyWebpage: WebpageSource = {
      ...webpageSource,
      source_id: 'src:empty123',
      markdown: '',
    };

    const envelope = buildContextEnvelope([emptyWebpage], 'Test');
    expect(envelope.chunks).toHaveLength(0);
  });

  it('should handle PDF with empty pages', () => {
    const emptyPdf: PdfSource = {
      kind: 'pdf',
      source_id: 'src:emptypdf',
      title: 'Empty PDF',
      captured_at: Date.now(),
      pages: [
        { page_number: 1, text: '' },
        { page_number: 2, text: '   ' },
      ],
    };

    const envelope = buildContextEnvelope([emptyPdf], 'Test');
    expect(envelope.chunks).toHaveLength(0);
  });

  it('should handle chatlog with no messages', () => {
    const emptyChatlog: ChatlogSource = {
      ...chatlogSource,
      source_id: 'src:emptychat',
      messages: [],
    };

    const envelope = buildContextEnvelope([emptyChatlog], 'Test');
    expect(envelope.chunks).toHaveLength(0);
  });

  it('should handle note with whitespace only', () => {
    const whitespaceNote: NoteSource = {
      ...noteSource,
      source_id: 'src:whitespace',
      text: '   \n\t  ',
    };

    const envelope = buildContextEnvelope([whitespaceNote], 'Test');
    expect(envelope.chunks).toHaveLength(0);
  });

  it('should preserve source order in index', () => {
    const sources: Source[] = [chatlogSource, webpageSource, noteSource];
    const envelope = buildContextEnvelope(sources, 'Test');

    expect(envelope.index.entries[0].source_id).toBe(chatlogSource.source_id);
    expect(envelope.index.entries[1].source_id).toBe(webpageSource.source_id);
    expect(envelope.index.entries[2].source_id).toBe(noteSource.source_id);
  });
});
