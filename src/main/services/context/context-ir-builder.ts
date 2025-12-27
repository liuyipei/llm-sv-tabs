/**
 * Context IR Builder
 *
 * Transforms Source[] into a ContextEnvelope - the provider-agnostic
 * intermediate representation for multimodal context.
 *
 * Phase 2 Implementation:
 * - Source[] → ContextEnvelope conversion
 * - Context Index generation
 * - Chunk building from sources
 * - Attachment manifest generation
 * - Text rendering format
 */

import type {
  Source,
  SourceId,
  Anchor,
  SourceKind,
  ContextEnvelope,
  ContextIndex,
  ContextIndexEntry,
  ContextChunk,
  AttachmentManifest,
  TokenBudgetState,
  ContextEnvelopeOptions,
  WebpageSource,
  PdfSource,
  ImageSource,
  NoteSource,
  ChatlogSource,
  BinaryBlob,
} from '../../../types/context-ir.js';
import { createAnchor } from './anchor-utils.js';

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Simple token estimation (roughly 4 characters per token)
 * Phase 3 will add more sophisticated token counting
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Context Envelope Builder
// ============================================================================

/**
 * Build a ContextEnvelope from sources and a task.
 *
 * @param sources - Array of Source objects to include in context
 * @param task - The user's query or task
 * @param options - Optional configuration for envelope building
 * @returns A complete ContextEnvelope ready for rendering
 */
export function buildContextEnvelope(
  sources: Source[],
  task: string,
  options: ContextEnvelopeOptions = {}
): ContextEnvelope {
  const { maxTokens = Infinity, includeAttachments = true } = options;

  // Build index entries
  const indexEntries = sources.map((source) =>
    buildIndexEntry(source, includeAttachments)
  );

  // Build chunks from each source
  const chunks = sources.flatMap((source) => buildChunksFromSource(source));

  // Build attachment manifest
  const attachments = includeAttachments
    ? sources.flatMap((source) => buildAttachmentsFromSource(source))
    : [];

  // Calculate token usage
  const taskTokens = estimateTokens(task);
  const indexTokens = estimateTokens(renderContextIndex({ entries: indexEntries }));
  const chunkTokens = chunks.reduce((sum, chunk) => sum + chunk.token_count, 0);
  const usedTokens = taskTokens + indexTokens + chunkTokens;

  // Build budget state (Phase 2: basic tracking, Phase 3: full degrade ladder)
  const budget: TokenBudgetState = {
    max_tokens: maxTokens === Infinity ? 0 : maxTokens,
    used_tokens: usedTokens,
    degrade_stage: 0, // Phase 2: always stage 0 (full content)
    cuts: [],
  };

  return {
    version: '1.0',
    created_at: Date.now(),
    sources,
    index: { entries: indexEntries },
    chunks,
    attachments,
    budget,
    task,
  };
}

// ============================================================================
// Index Entry Building
// ============================================================================

/**
 * Build a ContextIndexEntry from a Source
 */
function buildIndexEntry(
  source: Source,
  includeAttachments: boolean
): ContextIndexEntry {
  const entry: ContextIndexEntry = {
    source_id: source.source_id,
    title: source.title,
    url: source.url,
    source_type: source.kind,
    content_included: true, // Phase 2: always include content
  };

  // Add PDF-specific info
  if (source.kind === 'pdf') {
    const pdfSource = source as PdfSource;
    if (pdfSource.pages.length > 0 && includeAttachments) {
      const pagesWithImages = pdfSource.pages
        .filter((p) => p.image)
        .map((p) => p.page_number);
      if (pagesWithImages.length > 0) {
        entry.pages_attached = pagesWithImages;
      }
    }
  }

  return entry;
}

// ============================================================================
// Chunk Building
// ============================================================================

/**
 * Build ContextChunks from a Source
 */
function buildChunksFromSource(source: Source): ContextChunk[] {
  switch (source.kind) {
    case 'webpage':
      return buildWebpageChunks(source);
    case 'pdf':
      return buildPdfChunks(source);
    case 'image':
      return buildImageChunks(source);
    case 'note':
      return buildNoteChunks(source);
    case 'chatlog':
      return buildChatlogChunks(source);
    default:
      return [];
  }
}

/**
 * Build chunks from a webpage source
 */
function buildWebpageChunks(source: WebpageSource): ContextChunk[] {
  const content = source.markdown;
  if (!content.trim()) return [];

  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      source_type: 'webpage',
      title: source.title,
      url: source.url,
      extraction_method: source.extraction_type === 'app' ? 'app_v1' : 'readability_v1',
      quality: source.quality,
      content,
      token_count: estimateTokens(content),
    },
  ];
}

/**
 * Build chunks from a PDF source (one chunk per page with text)
 */
function buildPdfChunks(source: PdfSource): ContextChunk[] {
  return source.pages
    .filter((page) => page.text && page.text.trim())
    .map((page) => ({
      anchor: createAnchor(source.source_id, { type: 'page', page: page.page_number }),
      source_id: source.source_id,
      source_type: 'pdf' as SourceKind,
      title: source.title,
      url: source.url,
      extraction_method: 'pdf_text_v1',
      quality: page.quality,
      content: page.text!,
      token_count: estimateTokens(page.text!),
    }));
}

/**
 * Build chunks from an image source (alt text only)
 */
function buildImageChunks(source: ImageSource): ContextChunk[] {
  // Images don't have text content, but may have alt text
  if (!source.alt_text?.trim()) return [];

  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      source_type: 'image',
      title: source.title,
      url: source.url,
      extraction_method: 'alt_text_v1',
      content: source.alt_text,
      token_count: estimateTokens(source.alt_text),
    },
  ];
}

/**
 * Build chunks from a note source
 */
function buildNoteChunks(source: NoteSource): ContextChunk[] {
  const content = source.text;
  if (!content.trim()) return [];

  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      source_type: 'note',
      title: source.title,
      url: source.url,
      extraction_method: 'note_v1',
      content,
      token_count: estimateTokens(content),
    },
  ];
}

/**
 * Build chunks from a chatlog source (one chunk for the whole conversation)
 */
function buildChatlogChunks(source: ChatlogSource): ContextChunk[] {
  if (source.messages.length === 0) return [];

  const content = source.messages
    .map((msg) => `**${msg.role}**: ${msg.content}`)
    .join('\n\n');

  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      source_type: 'chatlog',
      title: source.title,
      url: source.url,
      extraction_method: 'chatlog_v1',
      content,
      token_count: estimateTokens(content),
    },
  ];
}

// ============================================================================
// Attachment Manifest Building
// ============================================================================

/**
 * Build AttachmentManifests from a Source
 */
function buildAttachmentsFromSource(source: Source): AttachmentManifest[] {
  switch (source.kind) {
    case 'webpage':
      return buildWebpageAttachments(source);
    case 'pdf':
      return buildPdfAttachments(source);
    case 'image':
      return buildImageAttachments(source);
    default:
      return [];
  }
}

/**
 * Build attachments from a webpage source (screenshot)
 */
function buildWebpageAttachments(source: WebpageSource): AttachmentManifest[] {
  if (!source.screenshot) return [];

  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      artifact_type: 'screenshot',
      mime_type: source.screenshot.mime_type,
      byte_size: source.screenshot.byte_size,
      included: true,
    },
  ];
}

/**
 * Build attachments from a PDF source (page images and/or raw PDF)
 */
function buildPdfAttachments(source: PdfSource): AttachmentManifest[] {
  const attachments: AttachmentManifest[] = [];

  // Add raw PDF if available
  if (source.pdf_bytes) {
    attachments.push({
      anchor: source.source_id,
      source_id: source.source_id,
      artifact_type: 'raw_pdf',
      mime_type: source.pdf_bytes.mime_type,
      byte_size: source.pdf_bytes.byte_size,
      included: true,
    });
  }

  // Add page images
  for (const page of source.pages) {
    if (page.image) {
      attachments.push({
        anchor: createAnchor(source.source_id, { type: 'page', page: page.page_number }),
        source_id: source.source_id,
        artifact_type: 'page_image',
        mime_type: page.image.mime_type,
        byte_size: page.image.byte_size,
        included: true,
      });
    }
  }

  return attachments;
}

/**
 * Build attachments from an image source
 */
function buildImageAttachments(source: ImageSource): AttachmentManifest[] {
  return [
    {
      anchor: source.source_id,
      source_id: source.source_id,
      artifact_type: 'raw_image',
      mime_type: source.image.mime_type,
      byte_size: source.image.byte_size,
      included: true,
    },
  ];
}

// ============================================================================
// Text Rendering
// ============================================================================

/**
 * Render the Context Index to text format.
 *
 * Format:
 * === CONTEXT INDEX ===
 * [1] src:9f3a7b2c | PDF | "Q3 Report" | 24 pages | pages attached: [1,2,12]
 * [2] src:1ab2cd3e | webpage | "Pricing" | https://example.com | full content
 */
export function renderContextIndex(index: ContextIndex): string {
  if (index.entries.length === 0) {
    return '=== CONTEXT INDEX ===\n(no sources)';
  }

  const lines = index.entries.map((entry, i) => {
    const parts: string[] = [`[${i + 1}]`, entry.source_id, entry.source_type, `"${entry.title}"`];

    if (entry.url) {
      parts.push(entry.url);
    }

    if (entry.pages_attached && entry.pages_attached.length > 0) {
      parts.push(`pages attached: [${entry.pages_attached.join(',')}]`);
    }

    if (entry.content_included) {
      parts.push('full content');
    } else if (entry.summary) {
      parts.push(`summary: "${entry.summary}"`);
    }

    return parts.join(' | ');
  });

  return `=== CONTEXT INDEX ===\n${lines.join('\n')}`;
}

/**
 * Render a single chunk to text format.
 *
 * Format:
 * [CHUNK]
 * anchor: src:9f3a7b2c#p=1
 * source_type: pdf
 * title: Q3 Financial Report
 * extraction: pdf_text_v1
 * quality: good
 * ---
 * <content here>
 * [/CHUNK]
 */
export function renderChunk(chunk: ContextChunk): string {
  const header = [
    `anchor: ${chunk.anchor}`,
    `source_type: ${chunk.source_type}`,
    `title: ${chunk.title}`,
  ];

  if (chunk.url) {
    header.push(`url: ${chunk.url}`);
  }

  header.push(`extraction: ${chunk.extraction_method}`);

  if (chunk.quality) {
    header.push(`quality: ${chunk.quality}`);
  }

  if (chunk.truncated) {
    header.push('status: [truncated]');
  }

  return `[CHUNK]\n${header.join('\n')}\n---\n${chunk.content}\n[/CHUNK]`;
}

/**
 * Render all chunks to text format.
 */
export function renderChunks(chunks: ContextChunk[]): string {
  if (chunks.length === 0) {
    return '=== CONTENT ===\n(no content)';
  }

  return `=== CONTENT ===\n\n${chunks.map(renderChunk).join('\n\n')}`;
}

/**
 * Render the attachment manifest to text format.
 *
 * Format:
 * === ATTACHMENTS ===
 * - anchor: src:9f3a7b2c#p=12 | kind: page_image | mime: image/png | 1275x1650
 * - anchor: src:5678efgh | kind: raw_image | mime: image/png | 800x600
 */
export function renderAttachments(attachments: AttachmentManifest[]): string {
  const included = attachments.filter((a) => a.included);

  if (included.length === 0) {
    return '=== ATTACHMENTS ===\n(no attachments)';
  }

  const lines = included.map((attachment) => {
    const parts: string[] = [
      `anchor: ${attachment.anchor}`,
      `kind: ${attachment.artifact_type}`,
      `mime: ${attachment.mime_type}`,
    ];

    if (attachment.dimensions) {
      parts.push(`${attachment.dimensions.width}x${attachment.dimensions.height}`);
    }

    if (attachment.byte_size) {
      parts.push(formatByteSize(attachment.byte_size));
    }

    return `- ${parts.join(' | ')}`;
  });

  return `=== ATTACHMENTS ===\n${lines.join('\n')}`;
}

/**
 * Render the complete ContextEnvelope to text format.
 *
 * This is the universal text format that any model can consume.
 */
export function renderEnvelopeAsText(envelope: ContextEnvelope): string {
  const sections: string[] = [];

  // Context Index (always first - survives all truncation)
  sections.push(renderContextIndex(envelope.index));

  // Content chunks
  sections.push(renderChunks(envelope.chunks));

  // Attachments manifest
  if (envelope.attachments.length > 0) {
    sections.push(renderAttachments(envelope.attachments));
  }

  // Task (always last)
  sections.push(`=== TASK ===\n${envelope.task}`);

  // Add cite instruction if there are anchors
  if (envelope.chunks.length > 0) {
    const exampleAnchor = envelope.chunks[0].anchor;
    sections.push(
      `\nWhen referencing content from the attached sources, cite using the anchor format:\n"According to ${exampleAnchor}, ..."`
    );
  }

  return sections.join('\n\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format byte size for display
 */
function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Get all binary attachments from an envelope.
 * Returns the actual binary data for provider adapters to use.
 */
export function getAttachmentData(
  envelope: ContextEnvelope,
  anchor: Anchor
): BinaryBlob | undefined {
  // Find the source for this anchor
  const sourceId = anchor.includes('#') ? (anchor.split('#')[0] as SourceId) : (anchor as SourceId);
  const source = envelope.sources.find((s) => s.source_id === sourceId);
  if (!source) return undefined;

  // Handle webpage screenshots
  if (source.kind === 'webpage' && source.screenshot && anchor === source.source_id) {
    return source.screenshot;
  }

  // Handle PDF page images
  if (source.kind === 'pdf') {
    // Check if anchor specifies a page
    const pageMatch = anchor.match(/#p=(\d+)$/);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      const page = source.pages.find((p) => p.page_number === pageNum);
      return page?.image;
    }
    // Return raw PDF if anchor is just the source
    if (anchor === source.source_id && source.pdf_bytes) {
      return source.pdf_bytes;
    }
  }

  // Handle images
  if (source.kind === 'image' && anchor === source.source_id) {
    return source.image;
  }

  return undefined;
}

/**
 * Get summary statistics for a ContextEnvelope
 */
export function getEnvelopeStats(envelope: ContextEnvelope): {
  sourceCount: number;
  chunkCount: number;
  attachmentCount: number;
  totalTokens: number;
  sourcesByType: Record<SourceKind, number>;
} {
  const sourcesByType: Record<SourceKind, number> = {
    webpage: 0,
    pdf: 0,
    image: 0,
    note: 0,
    chatlog: 0,
  };

  for (const source of envelope.sources) {
    sourcesByType[source.kind]++;
  }

  return {
    sourceCount: envelope.sources.length,
    chunkCount: envelope.chunks.length,
    attachmentCount: envelope.attachments.filter((a) => a.included).length,
    totalTokens: envelope.budget.used_tokens,
    sourcesByType,
  };
}
