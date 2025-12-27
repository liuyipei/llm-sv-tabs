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

// ============================================================================
// Context Envelope Types (Phase 2)
// ============================================================================

/**
 * The complete, provider-agnostic context package ready for rendering.
 */
export interface ContextEnvelope {
  /** Version for format evolution */
  version: '1.0';

  /** When this envelope was created (Unix timestamp) */
  created_at: number;

  /** All sources in this context */
  sources: Source[];

  /** The Context Index (always survives truncation) */
  index: ContextIndex;

  /** Ranked, formatted chunks ready for inclusion */
  chunks: ContextChunk[];

  /** Manifest of binary attachments */
  attachments: AttachmentManifest[];

  /** Token budget state */
  budget: TokenBudgetState;

  /** The user's task/query */
  task: string;
}

/**
 * Index of all sources - always survives truncation.
 * The model always knows what context exists, even if it can't see all of it.
 */
export interface ContextIndex {
  /** One entry per source */
  entries: ContextIndexEntry[];
}

/**
 * Single entry in the context index
 */
export interface ContextIndexEntry {
  /** Source reference */
  source_id: SourceId;
  /** Human-readable title */
  title: string;
  /** Origin URL */
  url?: string;
  /** Type of source */
  source_type: SourceKind;
  /** For PDFs: which pages are attached */
  pages_attached?: number[];
  /** Brief summary (1-2 lines) - used in truncated views */
  summary?: string;
  /** Whether full content is included in chunks */
  content_included: boolean;
}

/**
 * A formatted chunk of content ready for inclusion in context.
 */
export interface ContextChunk {
  /** Anchor for this chunk */
  anchor: Anchor;

  /** Source reference */
  source_id: SourceId;

  /** Source type (for rendering decisions) */
  source_type: SourceKind;

  /** Title context */
  title: string;

  /** URL context */
  url?: string;

  /** How this content was extracted */
  extraction_method: string;

  /** Quality hint */
  quality?: QualityHint;

  /** The actual text content */
  content: string;

  /** Token count for this chunk */
  token_count: number;

  /** Relevance score (for ranking) */
  relevance_score?: number;

  /** Whether this chunk was truncated */
  truncated?: boolean;
}

/**
 * Manifest entry for a binary attachment (image, PDF, etc.)
 */
export interface AttachmentManifest {
  /** Anchor for this attachment */
  anchor: Anchor;
  /** Source reference */
  source_id: SourceId;
  /** Type of artifact */
  artifact_type: ArtifactType;
  /** MIME type */
  mime_type: string;
  /** Size in bytes */
  byte_size: number;
  /** Image dimensions (if applicable) */
  dimensions?: { width: number; height: number };
  /** Transformation applied (e.g., "resize_512px") */
  transform?: string;
  /** Whether this attachment is included in the current budget */
  included: boolean;
}

/**
 * Artifact types for binary content
 */
export type ArtifactType =
  | 'text' // Extracted text (markdown)
  | 'page_image' // Rendered PDF page as PNG
  | 'screenshot' // Full page screenshot
  | 'thumbnail' // Resized preview image
  | 'raw_image' // Original uploaded image
  | 'raw_pdf' // Original PDF bytes
  | 'table_json'; // Structured table data

/**
 * Token budget state tracking
 */
export interface TokenBudgetState {
  /** Maximum tokens allowed */
  max_tokens: number;
  /** Current token usage */
  used_tokens: number;
  /** Current degrade stage (0-5) */
  degrade_stage: DegradeStage;
  /** What was cut */
  cuts: TokenBudgetCut[];
}

/**
 * Degrade stages for token budgeting (Phase 3 will implement full ladder)
 */
export type DegradeStage = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Record of what was cut during token budgeting
 */
export interface TokenBudgetCut {
  /** Type of cut */
  type: 'chunk_removed' | 'chunk_truncated' | 'attachment_removed' | 'summarized';
  /** Anchor of the affected content */
  anchor: Anchor;
  /** Original token count before cut */
  original_tokens: number;
  /** Reason for the cut */
  reason: string;
}

/**
 * Options for building a context envelope
 */
export interface ContextEnvelopeOptions {
  /** Maximum tokens for the entire context */
  maxTokens?: number;
  /** Whether to include binary attachments */
  includeAttachments?: boolean;
  /** Specific page numbers to include for PDFs (if not set, include all) */
  pdfPages?: Map<SourceId, number[]>;
}
