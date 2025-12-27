import { describe, it, expect } from 'vitest';
import { buildQueryContext, buildSourcesFromExtracted, estimateQueryTokens, shouldUseContextIR } from '../../src/main/services/context/query-context-builder';
import type { ExtractedContent, ContextTabInfo } from '../../src/types';

const htmlContent: ExtractedContent = {
  type: 'html', title: 'Article', url: 'https://example.com',
  content: 'Main content about testing.', metadata: { extractionType: 'article' },
};

const pdfContent: ExtractedContent = {
  type: 'pdf', title: 'Report', url: 'file:///report.pdf',
  content: '--- Page 1 ---\nSummary\n\n--- Page 2 ---\nDetails',
};

const imageContent: ExtractedContent = {
  type: 'image', title: 'Diagram', url: 'file:///arch.png', content: 'Architecture overview',
  imageData: { data: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' },
};

const textContent: ExtractedContent = { type: 'text', title: 'Notes', url: 'note://1', content: 'Meeting notes.' };

const tabInfos: ContextTabInfo[] = [
  { id: 'tab-1', title: 'Article', url: 'https://example.com', type: 'webpage' },
  { id: 'tab-2', title: 'Report', url: 'file:///report.pdf', type: 'pdf' },
  { id: 'tab-3', title: 'Diagram', url: 'file:///arch.png', type: 'upload' },
  { id: 'tab-4', title: 'Notes', url: 'note://1', type: 'notes' },
];

describe('buildQueryContext', () => {
  it('returns text, envelope, sources, and stats', () => {
    const result = buildQueryContext([htmlContent], [tabInfos[0]], 'Summarize');
    expect(result.text).toContain('=== CONTEXT INDEX ===');
    expect(result.text).toContain('=== TASK ===');
    expect(result.sources).toHaveLength(1);
    expect(result.envelope.task).toBe('Summarize');
    expect(result.stats.sourceCount).toBe(1);
  });

  it('builds context from multiple sources', () => {
    const result = buildQueryContext([htmlContent, pdfContent, textContent], tabInfos.slice(0, 3), 'Analyze');
    expect(result.sources).toHaveLength(3);
    expect(result.text).toContain('Article');
    expect(result.text).toContain('Report');
  });

  it('handles empty content array', () => {
    const result = buildQueryContext([], [], 'Hello');
    expect(result.sources).toHaveLength(0);
    expect(result.text).toContain('(no sources)');
  });

  it('includes cite instruction in rendered text', () => {
    const result = buildQueryContext([htmlContent], [tabInfos[0]], 'Test');
    expect(result.text).toContain('cite using the anchor format');
  });
});

describe('buildSourcesFromExtracted', () => {
  it('maps tab info to sources by index', () => {
    const sources = buildSourcesFromExtracted([htmlContent, textContent], [tabInfos[0], tabInfos[3]]);
    expect(sources).toHaveLength(2);
    expect(sources[0].tab_id).toBe('tab-1');
    expect(sources[1].tab_id).toBe('tab-4');
  });

  it('creates default tab info when not provided', () => {
    const sources = buildSourcesFromExtracted([htmlContent], []);
    expect(sources[0].tab_id).toBe('tab-0');
  });

  it('maps content types correctly', () => {
    const sources = buildSourcesFromExtracted([htmlContent, pdfContent, imageContent, textContent], []);
    expect(sources.map(s => s.kind)).toEqual(['webpage', 'pdf', 'image', 'note']);
  });
});

describe('estimateQueryTokens', () => {
  it('includes task and content tokens', () => {
    const withContent = estimateQueryTokens([htmlContent], 'Summarize');
    const withoutContent = estimateQueryTokens([], 'Summarize');
    expect(withContent).toBeGreaterThan(withoutContent);
  });

  it('handles SerializedDOM and PDFContent', () => {
    const dom: ExtractedContent = {
      type: 'html', title: 'Test', url: 'https://test.com',
      content: { title: 'Test', url: 'https://test.com', headings: [], paragraphs: [], links: [], mainContent: 'Main content.', metaTags: {} },
    };
    const pdf: ExtractedContent = {
      type: 'pdf', title: 'PDF', url: 'file:///test.pdf', content: { text: 'PDF text.', numPages: 1 },
    };
    expect(estimateQueryTokens([dom], 'Test')).toBeGreaterThan(0);
    expect(estimateQueryTokens([pdf], 'Test')).toBeGreaterThan(0);
  });
});

describe('shouldUseContextIR', () => {
  it('returns true', () => {
    expect(shouldUseContextIR()).toBe(true);
  });
});

describe('integration', () => {
  it('produces consistent source IDs for same input', () => {
    const r1 = buildQueryContext([htmlContent], [tabInfos[0]], 'Test');
    const r2 = buildQueryContext([htmlContent], [tabInfos[0]], 'Test');
    expect(r1.sources[0].source_id).toBe(r2.sources[0].source_id);
  });

  it('handles mixed content types', () => {
    const result = buildQueryContext([htmlContent, pdfContent, imageContent, textContent], tabInfos, 'Analyze');
    expect(result.sources.map(s => s.kind)).toContain('webpage');
    expect(result.sources.map(s => s.kind)).toContain('pdf');
    expect(result.sources.map(s => s.kind)).toContain('image');
    expect(result.sources.map(s => s.kind)).toContain('note');
  });
});
