/**
 * Context IR System - Phases 1 & 2
 *
 * Provider-agnostic intermediate representation for multimodal context.
 *
 * This module provides:
 * - Source types (discriminated unions for different content types)
 * - Source building (ExtractedContent → Source conversion)
 * - Anchor utilities (stable content identifiers)
 * - Context envelope building (Source[] → ContextEnvelope)
 * - Text rendering (ContextEnvelope → formatted text)
 *
 * See docs/design/18-context-ir-and-multimodal-protocol.md
 */

// Re-export types - Core types (Phase 1)
export type {
  Source,
  SourceId,
  Anchor,
  WebpageSource,
  PdfSource,
  ImageSource,
  NoteSource,
  ChatlogSource,
  BinaryBlob,
  PdfPage,
  ChatlogMessage,
  QualityHint,
  SourceKind,
  SourceOfKind,
  LocationType,
  ParsedAnchor,
} from '../../../types/context-ir.js';

// Re-export types - Envelope types (Phase 2)
export type {
  ContextEnvelope,
  ContextIndex,
  ContextIndexEntry,
  ContextChunk,
  AttachmentManifest,
  TokenBudgetState,
  TokenBudgetCut,
  DegradeStage,
  ArtifactType,
  ContextEnvelopeOptions,
} from '../../../types/context-ir.js';

// Anchor utilities
export {
  computeSourceId,
  createAnchor,
  parseAnchor,
  isValidSourceId,
  isValidAnchor,
  getSourceIdFromAnchor,
  type SourceIdInput,
  type LocationSpec,
} from './anchor-utils.js';

// Source building
export {
  buildSource,
  buildSources,
  getSourceText,
  getSourceQuality,
} from './source-builder.js';

// Context envelope building and rendering (Phase 2)
export {
  buildContextEnvelope,
  renderContextIndex,
  renderChunk,
  renderChunks,
  renderAttachments,
  renderEnvelopeAsText,
  getAttachmentData,
  getEnvelopeStats,
  estimateTokens,
} from './context-ir-builder.js';

// Query integration (Phase 2)
export {
  buildQueryContext,
  buildSourcesFromExtracted,
  estimateQueryTokens,
  shouldUseContextIR,
  type QueryContextResult,
  type QueryContextOptions,
} from './query-context-builder.js';
