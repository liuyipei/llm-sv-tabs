/**
 * Context IR System - Phase 1
 *
 * Provider-agnostic intermediate representation for multimodal context.
 *
 * This module provides:
 * - Source types (discriminated unions for different content types)
 * - Source building (ExtractedContent → Source conversion)
 * - Anchor utilities (stable content identifiers)
 * - Quality hints (text extraction quality assessment)
 *
 * See docs/design/18-context-ir-and-multimodal-protocol.md
 */

// Re-export types
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

// Quality hints
export {
  assessQuality,
  describeQuality,
  isQualitySufficientForText,
} from './quality-hints.js';

// Source building
export {
  buildSource,
  buildSources,
  getSourceText,
  getSourceQuality,
} from './source-builder.js';
