import { describe, it, expect } from 'vitest';
import {
  buildSource,
  buildSources,
  getSourceText,
  getSourceQuality,
} from '../../src/main/services/context/source-builder';
import type { ExtractedContent, ContextTabInfo } from '../../src/types';
import type {
  WebpageSource,
  PdfSource,
  ImageSource,
  NoteSource,
  ChatlogSource,
} from '../../src/types/context-ir';

describe('source-builder', () => {
  const mockTabInfo: ContextTabInfo = {
    id: 'tab-1',
    title: 'Test Tab',
    url: 'https://example.com',
    type: 'webpage',
  };

  describe('buildSource', () => {
    describe('webpage sources', () => {
      it('should build WebpageSource from HTML content', () => {
        const extracted: ExtractedContent = {
          type: 'html',
          title: 'Test Page',
          url: 'https://example.com',
          content: 'This is the main content of the page.',
          metadata: {
            extractionType: 'article',
          },
        };

        const source = buildSource(extracted, mockTabInfo) as WebpageSource;

        expect(source.kind).toBe('webpage');
        expect(source.title).toBe('Test Page');
        expect(source.url).toBe('https://example.com');
        expect(source.markdown).toBe('This is the main content of the page.');
        expect(source.extraction_type).toBe('article');
        expect(source.quality).toBe('good');
        expect(source.source_id).toMatch(/^src:[a-f0-9]{8}$/);
        expect(source.tab_id).toBe('tab-1');
      });

      it('should include screenshot when present', () => {
        const extracted: ExtractedContent = {
          type: 'html',
          title: 'Test Page',
          url: 'https://example.com',
          content: 'Content',
          screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        };

        const source = buildSource(extracted, mockTabInfo) as WebpageSource;

        expect(source.screenshot).toBeDefined();
        expect(source.screenshot?.mime_type).toBe('image/png');
        expect(source.screenshot?.data).toBeTruthy();
      });

      it('should default to article extraction type', () => {
        const extracted: ExtractedContent = {
          type: 'html',
          title: 'Test',
          url: 'https://example.com',
          content: 'Content',
        };

        const source = buildSource(extracted, mockTabInfo) as WebpageSource;

        expect(source.extraction_type).toBe('article');
      });
    });

    describe('PDF sources', () => {
      it('should build PdfSource from PDF content', () => {
        const extracted: ExtractedContent = {
          type: 'pdf',
          title: 'Test PDF',
          url: 'file:///test.pdf',
          content: '--- Page 1 ---\nFirst page content.\n\n--- Page 2 ---\nSecond page content.',
        };

        const source = buildSource(extracted, { ...mockTabInfo, type: 'pdf' }) as PdfSource;

        expect(source.kind).toBe('pdf');
        expect(source.title).toBe('Test PDF');
        expect(source.pages).toHaveLength(2);
        expect(source.pages[0].page_number).toBe(1);
        expect(source.pages[0].text).toBe('First page content.');
        expect(source.pages[1].page_number).toBe(2);
        expect(source.pages[1].text).toBe('Second page content.');
      });

      it('should handle PDF with page images', () => {
        const extracted: ExtractedContent = {
          type: 'pdf',
          title: 'Test PDF',
          url: 'file:///test.pdf',
          content: 'Full PDF text',
          metadata: {
            pdfPageImages: [
              {
                pageNumber: 1,
                data: 'data:image/png;base64,abc123',
                mimeType: 'image/png',
              },
            ],
          },
        };

        const source = buildSource(extracted, { ...mockTabInfo, type: 'pdf' }) as PdfSource;

        expect(source.kind).toBe('pdf');
        expect(source.pages.length).toBeGreaterThan(0);
        const pageWithImage = source.pages.find((p) => p.image);
        expect(pageWithImage).toBeDefined();
        expect(pageWithImage?.image?.mime_type).toBe('image/png');
      });
    });

    describe('image sources', () => {
      it('should build ImageSource from image content', () => {
        const extracted: ExtractedContent = {
          type: 'image',
          title: 'Test Image',
          url: 'file:///test.png',
          content: '',
          imageData: {
            data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            mimeType: 'image/png',
          },
        };

        const source = buildSource(extracted, { ...mockTabInfo, type: 'upload' }) as ImageSource;

        expect(source.kind).toBe('image');
        expect(source.title).toBe('Test Image');
        expect(source.image).toBeDefined();
        expect(source.image.mime_type).toBe('image/png');
        expect(source.image.byte_size).toBeGreaterThan(0);
      });

      it('should include alt_text from content', () => {
        const extracted: ExtractedContent = {
          type: 'image',
          title: 'Test Image',
          url: 'file:///test.png',
          content: 'A beautiful sunset over the ocean',
          imageData: {
            data: 'data:image/jpeg;base64,abc123',
            mimeType: 'image/jpeg',
          },
        };

        const source = buildSource(extracted, { ...mockTabInfo, type: 'upload' }) as ImageSource;

        expect(source.alt_text).toBe('A beautiful sunset over the ocean');
      });
    });

    describe('note sources', () => {
      it('should build NoteSource from text content', () => {
        const extracted: ExtractedContent = {
          type: 'text',
          title: 'My Notes',
          url: 'note://1',
          content: 'These are my personal notes about the topic.',
        };

        const source = buildSource(extracted, { ...mockTabInfo, type: 'notes' }) as NoteSource;

        expect(source.kind).toBe('note');
        expect(source.title).toBe('My Notes');
        expect(source.text).toBe('These are my personal notes about the topic.');
      });
    });

    describe('chatlog sources', () => {
      it('should build ChatlogSource from LLM response', () => {
        const extracted: ExtractedContent = {
          type: 'text',
          title: 'LLM Response',
          url: 'llm://response-1',
          content: `User Query:
What is the capital of France?

Assistant Response:
The capital of France is Paris.

Model: gpt-4`,
          metadata: {
            persistentId: 'uuid-123',
            shortId: 'abcd1234',
            slug: 'capital-of-france',
            model: 'gpt-4',
          },
        };

        const source = buildSource(extracted, mockTabInfo) as ChatlogSource;

        expect(source.kind).toBe('chatlog');
        expect(source.model).toBe('gpt-4');
        expect(source.messages).toHaveLength(2);
        expect(source.messages[0].role).toBe('user');
        expect(source.messages[0].content).toContain('capital of France');
        expect(source.messages[1].role).toBe('assistant');
        expect(source.messages[1].content).toContain('Paris');
      });

      it('should handle LLM response with context', () => {
        const extracted: ExtractedContent = {
          type: 'text',
          title: 'LLM Response',
          url: 'llm://response-2',
          content: `User Query (with context):
Based on the document, what is the main topic?

Assistant Response:
The main topic is climate change.`,
          metadata: {
            persistentId: 'uuid-456',
          },
        };

        const source = buildSource(extracted, mockTabInfo) as ChatlogSource;

        expect(source.kind).toBe('chatlog');
        expect(source.messages[0].content).toContain('main topic');
      });
    });
  });

  describe('buildSources', () => {
    it('should build multiple sources', () => {
      const items = [
        {
          extracted: {
            type: 'html' as const,
            title: 'Page 1',
            url: 'https://example.com/1',
            content: 'Content 1',
          },
          tabInfo: { ...mockTabInfo, id: 'tab-1' },
        },
        {
          extracted: {
            type: 'html' as const,
            title: 'Page 2',
            url: 'https://example.com/2',
            content: 'Content 2',
          },
          tabInfo: { ...mockTabInfo, id: 'tab-2' },
        },
      ];

      const sources = buildSources(items);

      expect(sources).toHaveLength(2);
      expect(sources[0].title).toBe('Page 1');
      expect(sources[1].title).toBe('Page 2');
    });
  });

  describe('getSourceText', () => {
    it('should get text from webpage source', () => {
      const source: WebpageSource = {
        kind: 'webpage',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        markdown: 'Webpage content here',
        extraction_type: 'article',
        quality: 'good',
      };

      expect(getSourceText(source)).toBe('Webpage content here');
    });

    it('should get text from PDF source', () => {
      const source: PdfSource = {
        kind: 'pdf',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        pages: [
          { page_number: 1, text: 'Page 1 text' },
          { page_number: 2, text: 'Page 2 text' },
        ],
      };

      const text = getSourceText(source);
      expect(text).toContain('Page 1 text');
      expect(text).toContain('Page 2 text');
    });

    it('should get alt_text from image source', () => {
      const source: ImageSource = {
        kind: 'image',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        image: { data: '', mime_type: 'image/png', byte_size: 0 },
        alt_text: 'Description of image',
      };

      expect(getSourceText(source)).toBe('Description of image');
    });

    it('should get text from note source', () => {
      const source: NoteSource = {
        kind: 'note',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        text: 'Note content',
      };

      expect(getSourceText(source)).toBe('Note content');
    });

    it('should get formatted text from chatlog source', () => {
      const source: ChatlogSource = {
        kind: 'chatlog',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        messages: [
          { index: 0, role: 'user', content: 'Hello' },
          { index: 1, role: 'assistant', content: 'Hi there!' },
        ],
      };

      const text = getSourceText(source);
      expect(text).toContain('user: Hello');
      expect(text).toContain('assistant: Hi there!');
    });
  });

  describe('getSourceQuality', () => {
    it('should always return good (quality assessment deferred)', () => {
      const webpageSource: WebpageSource = {
        kind: 'webpage',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        markdown: 'Content',
        extraction_type: 'article',
        quality: 'good',
      };

      const noteSource: NoteSource = {
        kind: 'note',
        source_id: 'src:12345678',
        title: 'Test',
        captured_at: Date.now(),
        text: 'Note content',
      };

      expect(getSourceQuality(webpageSource)).toBe('good');
      expect(getSourceQuality(noteSource)).toBe('good');
    });
  });

  describe('source_id consistency', () => {
    it('should generate same source_id for same content', () => {
      const extracted: ExtractedContent = {
        type: 'html',
        title: 'Test',
        url: 'https://example.com',
        content: 'Consistent content for hashing',
      };

      const source1 = buildSource(extracted, mockTabInfo);
      const source2 = buildSource(extracted, mockTabInfo);

      expect(source1.source_id).toBe(source2.source_id);
    });

    it('should generate different source_id for different content', () => {
      const extracted1: ExtractedContent = {
        type: 'html',
        title: 'Test',
        url: 'https://example.com',
        content: 'Content A',
      };

      const extracted2: ExtractedContent = {
        type: 'html',
        title: 'Test',
        url: 'https://example.com',
        content: 'Content B',
      };

      const source1 = buildSource(extracted1, mockTabInfo);
      const source2 = buildSource(extracted2, mockTabInfo);

      expect(source1.source_id).not.toBe(source2.source_id);
    });
  });
});
