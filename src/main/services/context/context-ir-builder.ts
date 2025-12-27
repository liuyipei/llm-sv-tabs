/**
 * Context IR Builder - Transforms Source[] into ContextEnvelope
 */

import type {
  Source, SourceId, Anchor, SourceKind, ContextEnvelope, ContextIndex,
  ContextIndexEntry, ContextChunk, AttachmentManifest, ContextEnvelopeOptions,
  WebpageSource, PdfSource, ImageSource, NoteSource, ChatlogSource, BinaryBlob,
} from '../../../types/context-ir.js';
import { createAnchor } from './anchor-utils.js';

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export function buildContextEnvelope(
  sources: Source[],
  task: string,
  options: ContextEnvelopeOptions = {}
): ContextEnvelope {
  const { maxTokens = Infinity, includeAttachments = true } = options;

  const indexEntries = sources.map((s) => buildIndexEntry(s, includeAttachments));
  const chunks = sources.flatMap(buildChunksFromSource);
  const attachments = includeAttachments ? sources.flatMap(buildAttachmentsFromSource) : [];

  const usedTokens = estimateTokens(task) +
    estimateTokens(renderContextIndex({ entries: indexEntries })) +
    chunks.reduce((sum, c) => sum + c.token_count, 0);

  return {
    version: '1.0',
    created_at: Date.now(),
    sources,
    index: { entries: indexEntries },
    chunks,
    attachments,
    budget: { max_tokens: maxTokens === Infinity ? 0 : maxTokens, used_tokens: usedTokens, degrade_stage: 0, cuts: [] },
    task,
  };
}

function buildIndexEntry(source: Source, includeAttachments: boolean): ContextIndexEntry {
  const entry: ContextIndexEntry = {
    source_id: source.source_id,
    title: source.title,
    url: source.url,
    source_type: source.kind,
    content_included: true,
  };

  if (source.kind === 'pdf' && includeAttachments) {
    const pagesWithImages = (source as PdfSource).pages.filter((p) => p.image).map((p) => p.page_number);
    if (pagesWithImages.length > 0) entry.pages_attached = pagesWithImages;
  }
  return entry;
}

function buildChunksFromSource(source: Source): ContextChunk[] {
  const base = { source_id: source.source_id, title: source.title, url: source.url };

  switch (source.kind) {
    case 'webpage': {
      const s = source as WebpageSource;
      if (!s.markdown.trim()) return [];
      return [{
        ...base, anchor: s.source_id, source_type: 'webpage',
        extraction_method: s.extraction_type === 'app' ? 'app_v1' : 'readability_v1',
        quality: s.quality, content: s.markdown, token_count: estimateTokens(s.markdown),
      }];
    }
    case 'pdf':
      return (source as PdfSource).pages
        .filter((p) => p.text?.trim())
        .map((p) => ({
          ...base, anchor: createAnchor(source.source_id, { type: 'page', page: p.page_number }),
          source_type: 'pdf' as SourceKind, extraction_method: 'pdf_text_v1',
          quality: p.quality, content: p.text!, token_count: estimateTokens(p.text!),
        }));
    case 'image': {
      const s = source as ImageSource;
      if (!s.alt_text?.trim()) return [];
      return [{ ...base, anchor: s.source_id, source_type: 'image', extraction_method: 'alt_text_v1', content: s.alt_text, token_count: estimateTokens(s.alt_text) }];
    }
    case 'note': {
      const s = source as NoteSource;
      if (!s.text.trim()) return [];
      return [{ ...base, anchor: s.source_id, source_type: 'note', extraction_method: 'note_v1', content: s.text, token_count: estimateTokens(s.text) }];
    }
    case 'chatlog': {
      const s = source as ChatlogSource;
      if (s.messages.length === 0) return [];
      const content = s.messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n');
      return [{ ...base, anchor: s.source_id, source_type: 'chatlog', extraction_method: 'chatlog_v1', content, token_count: estimateTokens(content) }];
    }
    default:
      return [];
  }
}

function buildAttachmentsFromSource(source: Source): AttachmentManifest[] {
  const base = { source_id: source.source_id, included: true };

  switch (source.kind) {
    case 'webpage': {
      const s = source as WebpageSource;
      return s.screenshot ? [{ ...base, anchor: s.source_id, artifact_type: 'screenshot', mime_type: s.screenshot.mime_type, byte_size: s.screenshot.byte_size }] : [];
    }
    case 'pdf': {
      const s = source as PdfSource;
      const attachments: AttachmentManifest[] = [];
      if (s.pdf_bytes) attachments.push({ ...base, anchor: s.source_id, artifact_type: 'raw_pdf', mime_type: s.pdf_bytes.mime_type, byte_size: s.pdf_bytes.byte_size });
      for (const p of s.pages.filter((p) => p.image)) {
        attachments.push({ ...base, anchor: createAnchor(s.source_id, { type: 'page', page: p.page_number }), artifact_type: 'page_image', mime_type: p.image!.mime_type, byte_size: p.image!.byte_size });
      }
      return attachments;
    }
    case 'image': {
      const s = source as ImageSource;
      return [{ ...base, anchor: s.source_id, artifact_type: 'raw_image', mime_type: s.image.mime_type, byte_size: s.image.byte_size }];
    }
    default:
      return [];
  }
}

// Text Rendering
export function renderContextIndex(index: ContextIndex): string {
  if (index.entries.length === 0) return '=== CONTEXT INDEX ===\n(no sources)';
  const lines = index.entries.map((e, i) => {
    const parts = [`[${i + 1}]`, e.source_id, e.source_type, `"${e.title}"`];
    if (e.url) parts.push(e.url);
    if (e.pages_attached?.length) parts.push(`pages attached: [${e.pages_attached.join(',')}]`);
    if (e.content_included) parts.push('full content');
    else if (e.summary) parts.push(`summary: "${e.summary}"`);
    return parts.join(' | ');
  });
  return `=== CONTEXT INDEX ===\n${lines.join('\n')}`;
}

export function renderChunk(chunk: ContextChunk): string {
  const header = [`anchor: ${chunk.anchor}`, `source_type: ${chunk.source_type}`, `title: ${chunk.title}`];
  if (chunk.url) header.push(`url: ${chunk.url}`);
  header.push(`extraction: ${chunk.extraction_method}`);
  if (chunk.quality) header.push(`quality: ${chunk.quality}`);
  if (chunk.truncated) header.push('status: [truncated]');
  return `[CHUNK]\n${header.join('\n')}\n---\n${chunk.content}\n[/CHUNK]`;
}

export function renderChunks(chunks: ContextChunk[]): string {
  return chunks.length === 0 ? '=== CONTENT ===\n(no content)' : `=== CONTENT ===\n\n${chunks.map(renderChunk).join('\n\n')}`;
}

export function renderAttachments(attachments: AttachmentManifest[]): string {
  const included = attachments.filter((a) => a.included);
  if (included.length === 0) return '=== ATTACHMENTS ===\n(no attachments)';
  const formatSize = (b: number) => b < 1024 ? `${b}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / (1024 * 1024)).toFixed(1)}MB`;
  const lines = included.map((a) => {
    const parts = [`anchor: ${a.anchor}`, `kind: ${a.artifact_type}`, `mime: ${a.mime_type}`];
    if (a.dimensions) parts.push(`${a.dimensions.width}x${a.dimensions.height}`);
    if (a.byte_size) parts.push(formatSize(a.byte_size));
    return `- ${parts.join(' | ')}`;
  });
  return `=== ATTACHMENTS ===\n${lines.join('\n')}`;
}

export function renderEnvelopeAsText(envelope: ContextEnvelope): string {
  const sections = [renderContextIndex(envelope.index), renderChunks(envelope.chunks)];
  if (envelope.attachments.length > 0) sections.push(renderAttachments(envelope.attachments));
  sections.push(`=== TASK ===\n${envelope.task}`);
  if (envelope.chunks.length > 0) {
    sections.push(`\nWhen referencing content from the attached sources, cite using the anchor format:\n"According to ${envelope.chunks[0].anchor}, ..."`);
  }
  return sections.join('\n\n');
}

export function getAttachmentData(envelope: ContextEnvelope, anchor: Anchor): BinaryBlob | undefined {
  const sourceId = (anchor.includes('#') ? anchor.split('#')[0] : anchor) as SourceId;
  const source = envelope.sources.find((s) => s.source_id === sourceId);
  if (!source) return undefined;

  if (source.kind === 'webpage' && anchor === source.source_id) return (source as WebpageSource).screenshot;
  if (source.kind === 'image' && anchor === source.source_id) return (source as ImageSource).image;
  if (source.kind === 'pdf') {
    const pageMatch = anchor.match(/#p=(\d+)$/);
    if (pageMatch) return (source as PdfSource).pages.find((p) => p.page_number === parseInt(pageMatch[1], 10))?.image;
    if (anchor === source.source_id) return (source as PdfSource).pdf_bytes;
  }
  return undefined;
}

export function getEnvelopeStats(envelope: ContextEnvelope) {
  const sourcesByType: Record<SourceKind, number> = { webpage: 0, pdf: 0, image: 0, note: 0, chatlog: 0 };
  envelope.sources.forEach((s) => sourcesByType[s.kind]++);
  return {
    sourceCount: envelope.sources.length,
    chunkCount: envelope.chunks.length,
    attachmentCount: envelope.attachments.filter((a) => a.included).length,
    totalTokens: envelope.budget.used_tokens,
    sourcesByType,
  };
}
