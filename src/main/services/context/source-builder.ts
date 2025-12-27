/**
 * Source Builder
 *
 * Transforms ExtractedContent (from content-extractor.ts) into
 * the new Source types for the Context IR system.
 *
 * This provides backward compatibility - existing extraction code
 * continues to work, and we layer the new Source abstraction on top.
 */

import type {
  ExtractedContent,
  ContextTabInfo,
  PDFContent,
  SerializedDOM,
} from '../../../types.js';
import type {
  Source,
  WebpageSource,
  PdfSource,
  ImageSource,
  NoteSource,
  ChatlogSource,
  BinaryBlob,
  PdfPage,
  QualityHint,
} from '../../../types/context-ir.js';
import { computeSourceId } from './anchor-utils.js';
import { assessQuality } from './quality-hints.js';

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build a Source from ExtractedContent and tab info
 *
 * @param extracted - Content extracted from a tab
 * @param tabInfo - Information about the source tab
 * @returns A Source object ready for the Context IR system
 */
export function buildSource(
  extracted: ExtractedContent,
  tabInfo: ContextTabInfo
): Source {
  const sourceId = computeSourceId({
    url: extracted.url,
    content: getContentForHashing(extracted),
  });

  const baseProps = {
    source_id: sourceId,
    title: extracted.title,
    url: extracted.url || undefined,
    captured_at: Date.now(),
    tab_id: tabInfo.id,
  };

  switch (extracted.type) {
    case 'html':
      return buildWebpageSource(extracted, baseProps);

    case 'pdf':
      return buildPdfSource(extracted, baseProps);

    case 'image':
      return buildImageSource(extracted, baseProps);

    case 'text':
      // Text could be a note or a chatlog (LLM response)
      if (isLlmResponse(extracted)) {
        return buildChatlogSource(extracted, baseProps);
      }
      return buildNoteSource(extracted, baseProps);

    default:
      // Fallback to note for unknown types
      return buildNoteSource(extracted, baseProps);
  }
}

// ============================================================================
// Source Type Builders
// ============================================================================

/**
 * Build a WebpageSource from HTML extracted content
 */
function buildWebpageSource(
  extracted: ExtractedContent,
  baseProps: BaseSourceProps
): WebpageSource {
  const markdown = extractMarkdownContent(extracted);
  const quality = assessQuality(markdown);

  const source: WebpageSource = {
    ...baseProps,
    kind: 'webpage',
    markdown,
    extraction_type: (extracted.metadata?.extractionType as 'article' | 'app') || 'article',
    quality,
  };

  // Add screenshot if available
  if (extracted.screenshot) {
    source.screenshot = dataUrlToBlob(extracted.screenshot);
  }

  return source;
}

/**
 * Build a PdfSource from PDF extracted content
 */
function buildPdfSource(
  extracted: ExtractedContent,
  baseProps: BaseSourceProps
): PdfSource {
  const pages: PdfPage[] = [];

  // Handle PDFContent type
  if (isPdfContent(extracted.content)) {
    const pdfContent = extracted.content;
    // Create a single page with all text
    pages.push({
      page_number: 1,
      text: pdfContent.text,
      quality: assessQuality(pdfContent.text),
    });
  } else if (typeof extracted.content === 'string') {
    // Text-only extraction
    pages.push({
      page_number: 1,
      text: extracted.content,
      quality: assessQuality(extracted.content),
    });
  }

  // Handle per-page content from metadata
  const pdfPageImages = extracted.metadata?.pdfPageImages as
    | Array<{ pageNumber: number; data: string; mimeType: string }>
    | undefined;

  if (pdfPageImages && pdfPageImages.length > 0) {
    // Merge with or create page entries for images
    for (const pageImage of pdfPageImages) {
      const existingPage = pages.find((p) => p.page_number === pageImage.pageNumber);
      if (existingPage) {
        existingPage.image = dataUrlToBlob(pageImage.data);
      } else {
        pages.push({
          page_number: pageImage.pageNumber,
          image: dataUrlToBlob(pageImage.data),
        });
      }
    }
    // Sort pages by page number
    pages.sort((a, b) => a.page_number - b.page_number);
  }

  // Parse page markers from text content to split into multiple pages
  if (typeof extracted.content === 'string' && extracted.content.includes('--- Page ')) {
    const parsedPages = parsePageMarkers(extracted.content);
    if (parsedPages.length > 1) {
      // Replace single page with parsed pages
      pages.length = 0;
      for (const parsedPage of parsedPages) {
        pages.push({
          page_number: parsedPage.pageNumber,
          text: parsedPage.text,
          quality: assessQuality(parsedPage.text),
        });
      }
    }
  }

  return {
    ...baseProps,
    kind: 'pdf',
    pages,
  };
}

/**
 * Build an ImageSource from image extracted content
 */
function buildImageSource(
  extracted: ExtractedContent,
  baseProps: BaseSourceProps
): ImageSource {
  let imageBlob: BinaryBlob;

  if (extracted.imageData) {
    imageBlob = {
      data: extractBase64Data(extracted.imageData.data),
      mime_type: extracted.imageData.mimeType,
      byte_size: estimateBase64Size(extracted.imageData.data),
    };
  } else {
    // Fallback - create empty placeholder
    imageBlob = {
      data: '',
      mime_type: 'image/png',
      byte_size: 0,
    };
  }

  return {
    ...baseProps,
    kind: 'image',
    image: imageBlob,
    alt_text: typeof extracted.content === 'string' ? extracted.content : undefined,
  };
}

/**
 * Build a NoteSource from text content
 */
function buildNoteSource(
  extracted: ExtractedContent,
  baseProps: BaseSourceProps
): NoteSource {
  const text = typeof extracted.content === 'string' ? extracted.content : '';

  return {
    ...baseProps,
    kind: 'note',
    text,
  };
}

/**
 * Build a ChatlogSource from LLM response content
 */
function buildChatlogSource(
  extracted: ExtractedContent,
  baseProps: BaseSourceProps
): ChatlogSource {
  const messages = parseChatlogContent(extracted);

  return {
    ...baseProps,
    kind: 'chatlog',
    model: extracted.metadata?.model as string | undefined,
    messages,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Base properties passed to all source builders
 */
interface BaseSourceProps {
  source_id: `src:${string}`;
  title: string;
  url?: string;
  captured_at: number;
  tab_id?: string;
}

/**
 * Get content string for hashing (source ID generation)
 */
function getContentForHashing(extracted: ExtractedContent): string {
  if (typeof extracted.content === 'string') {
    return extracted.content;
  }
  return JSON.stringify(extracted.content);
}

/**
 * Extract markdown/text content from various content types
 */
function extractMarkdownContent(extracted: ExtractedContent): string {
  if (typeof extracted.content === 'string') {
    return extracted.content;
  }

  // Handle SerializedDOM
  if (isSerializedDom(extracted.content)) {
    return extracted.content.mainContent || '';
  }

  // Handle PDFContent
  if (isPdfContent(extracted.content)) {
    return extracted.content.text;
  }

  return JSON.stringify(extracted.content);
}

/**
 * Type guard for SerializedDOM
 */
function isSerializedDom(content: unknown): content is SerializedDOM {
  return (
    typeof content === 'object' &&
    content !== null &&
    'mainContent' in content &&
    'headings' in content
  );
}

/**
 * Type guard for PDFContent
 */
function isPdfContent(content: unknown): content is PDFContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'text' in content &&
    'numPages' in content
  );
}

/**
 * Check if extracted content is an LLM response
 */
function isLlmResponse(extracted: ExtractedContent): boolean {
  const metadata = extracted.metadata;
  if (!metadata) return false;

  // Check for LLM response indicators
  return Boolean(
    metadata.persistentId ||
    metadata.shortId ||
    metadata.slug ||
    (typeof extracted.content === 'string' &&
      (extracted.content.includes('User Query') ||
        extracted.content.includes('Assistant Response')))
  );
}

/**
 * Parse chatlog content from LLM response format
 */
function parseChatlogContent(
  extracted: ExtractedContent
): Array<{ index: number; role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ index: number; role: 'user' | 'assistant'; content: string }> = [];
  const text = typeof extracted.content === 'string' ? extracted.content : '';

  // Parse "User Query:" and "Assistant Response:" sections
  const userQueryMatch = text.match(/User Query(?:\s*\(with context\))?:\s*([\s\S]*?)(?=Assistant Response:|$)/i);
  const assistantMatch = text.match(/Assistant Response:\s*([\s\S]*?)(?=Model:|Tokens|$)/i);

  if (userQueryMatch && userQueryMatch[1]) {
    messages.push({
      index: 0,
      role: 'user',
      content: userQueryMatch[1].trim(),
    });
  }

  if (assistantMatch && assistantMatch[1]) {
    messages.push({
      index: 1,
      role: 'assistant',
      content: assistantMatch[1].trim(),
    });
  }

  // If no structured format found, treat entire content as assistant response
  if (messages.length === 0 && text.trim()) {
    messages.push({
      index: 0,
      role: 'assistant',
      content: text.trim(),
    });
  }

  return messages;
}

/**
 * Convert a data URL to a BinaryBlob
 */
function dataUrlToBlob(dataUrl: string): BinaryBlob {
  // Check if it's a data URL or already just base64
  const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (dataUrlMatch) {
    return {
      data: dataUrlMatch[2],
      mime_type: dataUrlMatch[1],
      byte_size: estimateBase64Size(dataUrlMatch[2]),
    };
  }

  // Assume it's already base64, guess mime type from content
  return {
    data: dataUrl,
    mime_type: 'application/octet-stream',
    byte_size: estimateBase64Size(dataUrl),
  };
}

/**
 * Extract base64 data from a potential data URL
 */
function extractBase64Data(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
}

/**
 * Estimate original byte size from base64 string
 */
function estimateBase64Size(base64: string): number {
  // Remove any whitespace
  const cleanBase64 = base64.replace(/\s/g, '');
  // Base64 encodes 3 bytes as 4 characters
  // Account for padding
  const padding = (cleanBase64.match(/=/g) || []).length;
  return Math.floor((cleanBase64.length * 3) / 4) - padding;
}

/**
 * Parse page markers from PDF text content
 * Format: "--- Page N ---"
 */
function parsePageMarkers(
  content: string
): Array<{ pageNumber: number; text: string }> {
  const pages: Array<{ pageNumber: number; text: string }> = [];
  const parts = content.split(/---\s*Page\s+(\d+)\s*---/);

  // parts[0] is any content before the first page marker
  // parts[1] is page number, parts[2] is content
  // parts[3] is next page number, parts[4] is content, etc.

  for (let i = 1; i < parts.length; i += 2) {
    const pageNumber = parseInt(parts[i], 10);
    const text = parts[i + 1]?.trim() || '';
    pages.push({ pageNumber, text });
  }

  return pages;
}

// ============================================================================
// Batch Building
// ============================================================================

/**
 * Build Sources from multiple ExtractedContent items
 *
 * @param items - Array of extracted content with tab info
 * @returns Array of Source objects
 */
export function buildSources(
  items: Array<{ extracted: ExtractedContent; tabInfo: ContextTabInfo }>
): Source[] {
  return items.map(({ extracted, tabInfo }) => buildSource(extracted, tabInfo));
}

// ============================================================================
// Source Utilities
// ============================================================================

/**
 * Get the primary text content from a source
 */
export function getSourceText(source: Source): string {
  switch (source.kind) {
    case 'webpage':
      return source.markdown;

    case 'pdf':
      return source.pages.map((p) => p.text || '').join('\n\n');

    case 'image':
      return source.alt_text || '';

    case 'note':
      return source.text;

    case 'chatlog':
      return source.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  }
}

/**
 * Get a quality hint for the entire source
 */
export function getSourceQuality(source: Source): QualityHint {
  switch (source.kind) {
    case 'webpage':
      return source.quality;

    case 'pdf': {
      // Return worst quality among pages, or 'good' if no text
      const qualities = source.pages
        .map((p) => p.quality)
        .filter((q): q is QualityHint => q !== undefined);
      if (qualities.length === 0) return 'good';
      if (qualities.includes('low')) return 'low';
      if (qualities.includes('ocr_like')) return 'ocr_like';
      if (qualities.includes('mixed')) return 'mixed';
      return 'good';
    }

    case 'image':
      // Images don't have text quality
      return 'good';

    case 'note':
      return assessQuality(source.text);

    case 'chatlog':
      // Chatlogs are typically good quality (LLM output)
      return 'good';
  }
}
