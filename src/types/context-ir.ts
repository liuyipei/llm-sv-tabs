/**
 * Context IR Types (v1)
 *
 * Provider-agnostic intermediate representation for multimodal context.
 * Uses discriminated unions for simplicity in v1.
 *
 * See docs/design/18-context-ir-and-multimodal-protocol.md for full design.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Unique identifier for a source, derived from content hash.
 * Format: "src:<sha256-first-8-chars>"
 * Example: "src:9f3a7b2c"
 *
 * 8 hex chars = 4 billion combinations, sufficient for deduplication
 * while keeping anchors readable in prompts.
 */
export type SourceId = `src:${string}`;

/**
 * Anchor for citing specific locations within a source.
 * Format: "<source_id>#<location>" or just "<source_id>"
 *
 * Examples:
 *   "src:9f3a7b2c"          - Whole document
 *   "src:9f3a7b2c#p=12"     - PDF page 12
 *   "src:1ab2cd3e#sec=H2.3" - Webpage section under 3rd H2
 *   "src:5cd6efgh#msg=5"    - Message 5 in a chat log
 */
export type Anchor = `${SourceId}#${string}` | SourceId;

/**
 * Quality assessment hint for extracted content.
 * Computed during extraction using heuristics.
 */
export type QualityHint = 'good' | 'mixed' | 'low' | 'ocr_like';

/**
 * Quality hint heuristics:
 *
 * 'good':     - Text density > 50 chars per line average
 *             - < 5% non-ASCII characters
 *             - Recognizable word patterns
 *
 * 'mixed':    - Some garbled text or encoding issues
 *             - Inconsistent spacing/formatting
 *             - 5-20% non-ASCII characters
 *
 * 'low':      - Sparse text with lots of whitespace
 *             - > 20% non-ASCII or control characters
 *             - Very short average word length (< 3 chars)
 *
 * 'ocr_like': - Detected OCR patterns (single-char words, unusual spacing)
 *             - Common OCR errors (rn→m, l→1, O→0)
 *             - No embedded fonts in PDF source
 */

// ============================================================================
// Binary Blob
// ============================================================================

/**
 * Binary data container (images, PDFs, etc.)
 */
export interface BinaryBlob {
  /** Base64-encoded data (without data URL prefix) */
  data: string;
  /** MIME type (e.g., 'image/png', 'application/pdf') */
  mime_type: string;
  /** Size in bytes of the original data */
  byte_size: number;
}

// ============================================================================
// Source Types (Discriminated Union)
// ============================================================================

/**
 * Union of all source types
 */
export type Source =
  | WebpageSource
  | PdfSource
  | ImageSource
  | NoteSource
  | ChatlogSource;

/**
 * Base properties shared by all source types
 */
export interface BaseSource {
  /** Stable hash-based identifier */
  source_id: SourceId;
  /** Human-readable title */
  title: string;
  /** Origin URL (if applicable) */
  url?: string;
  /** When this content was captured (Unix timestamp) */
  captured_at: number;
  /** Original tab ID (ephemeral, for session reference) */
  tab_id?: string;
}

/**
 * Webpage source (extracted from browser tabs)
 */
export interface WebpageSource extends BaseSource {
  kind: 'webpage';
  /** Extracted markdown or HTML content */
  markdown: string;
  /** Optional screenshot for vision models */
  screenshot?: BinaryBlob;
  /** Extraction method used */
  extraction_type: 'article' | 'app';
  /** Quality assessment of extracted text */
  quality: QualityHint;
}

/**
 * PDF source (uploaded or linked PDF documents)
 */
export interface PdfSource extends BaseSource {
  kind: 'pdf';
  /** Original PDF bytes (for native PDF support) */
  pdf_bytes?: BinaryBlob;
  /** Per-page content */
  pages: PdfPage[];
}

/**
 * Single PDF page content
 */
export interface PdfPage {
  /** 1-indexed page number */
  page_number: number;
  /** Extracted text content */
  text?: string;
  /** Rendered page image */
  image?: BinaryBlob;
  /** Quality assessment of extracted text */
  quality?: QualityHint;
}

/**
 * Image source (uploaded images)
 */
export interface ImageSource extends BaseSource {
  kind: 'image';
  /** The image data */
  image: BinaryBlob;
  /** Alt text or description (for text-only models) */
  alt_text?: string;
}

/**
 * Note source (user-created text notes)
 */
export interface NoteSource extends BaseSource {
  kind: 'note';
  /** Plain text or markdown content */
  text: string;
}

/**
 * Chatlog source (LLM conversation history)
 */
export interface ChatlogSource extends BaseSource {
  kind: 'chatlog';
  /** Model used in the conversation */
  model?: string;
  /** Messages in the conversation */
  messages: ChatlogMessage[];
}

/**
 * Single message in a chatlog
 */
export interface ChatlogMessage {
  /** 0-indexed message position */
  index: number;
  /** Role of the message sender */
  role: 'user' | 'assistant';
  /** Message content */
  content: string;
}

// ============================================================================
// Source Kind Type
// ============================================================================

/**
 * Type discriminator for sources
 */
export type SourceKind = Source['kind'];

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract a specific source type from the union
 */
export type SourceOfKind<K extends SourceKind> = Extract<Source, { kind: K }>;

/**
 * Location specifier types for anchors
 */
export type LocationType = 'page' | 'section' | 'message' | 'region';

/**
 * Parsed anchor with location information
 */
export interface ParsedAnchor {
  /** The source ID */
  source_id: SourceId;
  /** Optional location within the source */
  location?: {
    type: LocationType;
    value: string;
  };
  /** Raw location string (e.g., "p=12", "sec=H2.3") */
  raw_location?: string;
}
