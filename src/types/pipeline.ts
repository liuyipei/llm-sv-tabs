/**
 * Pipeline Types for Content Normalization
 *
 * Defines staged extraction pipelines with visible intermediate artifacts.
 * Each source goes through: Capture → Render → Extract stages.
 *
 * See docs/design/19-content-normalization-ui.md for full design.
 */

import type { Anchor, BinaryBlob, QualityHint, SourceId, SourceKind } from './context-ir';

// ============================================================================
// Pipeline Stages
// ============================================================================

/**
 * Pipeline stages in order of execution
 */
export type PipelineStage = 'capture' | 'render' | 'extract';

/**
 * All pipeline stages for iteration
 */
export const PIPELINE_STAGES: readonly PipelineStage[] = ['capture', 'render', 'extract'] as const;

// ============================================================================
// Artifact Provenance
// ============================================================================

/**
 * Tracks how an artifact was created and from what.
 * Enables full lineage tracing from derived artifacts back to sources.
 */
export interface ArtifactProvenance {
  /** Method/tool used to create this artifact */
  method: string;

  /** Version of the method (for reproducibility) */
  version: string;

  /** Parent artifact IDs (empty for capture stage) */
  parent_ids: string[];

  /** Configuration used during creation */
  config?: Record<string, unknown>;

  /** Duration of the operation in milliseconds */
  duration_ms?: number;
}

// ============================================================================
// Base Artifact
// ============================================================================

/**
 * Base interface for all pipeline artifacts.
 * Every artifact tracks its provenance and selection state.
 */
export interface PipelineArtifactBase {
  /** Unique ID for this artifact instance (uuid v4) */
  artifact_id: string;

  /** The stage that produced this artifact */
  stage: PipelineStage;

  /** Anchor to the source (maintains Context IR compatibility) */
  source_anchor: Anchor;

  /** When this artifact was created (Unix timestamp) */
  created_at: number;

  /** What produced this artifact */
  provenance: ArtifactProvenance;

  /** Current selection state for context inclusion */
  selected: boolean;

  /** Optional user-provided label */
  label?: string;
}

// ============================================================================
// Capture Stage Artifacts
// ============================================================================

/**
 * Types of content captured at the capture stage
 */
export type CaptureType =
  | 'screenshot' // Full page screenshot
  | 'dom_snapshot' // Serialized DOM state
  | 'pdf_bytes' // Original PDF file
  | 'image_bytes' // Original image file
  | 'text'; // Plain text content

/**
 * Capture stage artifact: Original content preserved.
 * This is the first stage - preserving the source as-is.
 */
export interface CaptureArtifact extends PipelineArtifactBase {
  stage: 'capture';

  /** Type of captured content */
  capture_type: CaptureType;

  /** The captured data (binary blob or text) */
  data: BinaryBlob | string;

  /** Source URL or identifier */
  source_uri: string;

  /** Original dimensions for visual content */
  dimensions?: { width: number; height: number };

  /** MIME type of the captured content */
  mime_type: string;
}

// ============================================================================
// Render Stage Artifacts
// ============================================================================

/**
 * Types of rendering transformations
 */
export type RenderType =
  | 'pdf_pages' // Webpage printed to PDF, then rasterized
  | 'scrolling_screenshots' // Multiple viewport screenshots
  | 'rasterized_pages' // PDF pages rendered to images
  | 'thumbnail'; // Downscaled preview

/**
 * A single rendered page/frame from the render stage
 */
export interface RenderedPage {
  /** Page/frame number (1-indexed) */
  page_number: number;

  /** The rendered image */
  image: BinaryBlob;

  /** Page-specific anchor for citations */
  anchor: Anchor;

  /** Dimensions in pixels */
  dimensions: { width: number; height: number };

  /** Optional thumbnail for UI previews */
  thumbnail?: BinaryBlob;
}

/**
 * Configuration for rendering operations
 */
export interface RenderConfig {
  /** DPI for PDF rasterization (default: 150) */
  dpi?: number;

  /** Viewport width for screenshots */
  viewport_width?: number;

  /** Viewport height for screenshots */
  viewport_height?: number;

  /** Output image format */
  format: 'png' | 'jpeg' | 'webp';

  /** JPEG/WebP quality (0-100) */
  quality?: number;

  /** Maximum dimension (downscale if larger) */
  max_dimension?: number;
}

/**
 * Render stage artifact: Normalized visual representation.
 * Transforms content into consistent visual format.
 */
export interface RenderArtifact extends PipelineArtifactBase {
  stage: 'render';

  /** Type of rendering performed */
  render_type: RenderType;

  /** Rendered pages/frames */
  pages: RenderedPage[];

  /** Configuration used for rendering */
  render_config: RenderConfig;

  /** Total page count */
  page_count: number;
}

// ============================================================================
// Extract Stage Artifacts
// ============================================================================

/**
 * Methods for text extraction
 */
export type ExtractType =
  | 'text_layer' // PDF.js text layer extraction
  | 'ocr' // Tesseract or similar OCR
  | 'vision' // LLM vision model extraction
  | 'readability' // Mozilla Readability for articles
  | 'dom_walker'; // Custom DOM traversal for apps

/**
 * Text extracted from a single page
 */
export interface PageText {
  /** Page number (1-indexed) */
  page_number: number;

  /** Extracted text content */
  text: string;

  /** Quality assessment for this page */
  quality: QualityHint;

  /** Page-specific anchor */
  anchor: Anchor;

  /** Character count */
  char_count: number;
}

/**
 * Extract stage artifact: Derived text content.
 * Text is derived from visual/binary sources.
 */
export interface ExtractArtifact extends PipelineArtifactBase {
  stage: 'extract';

  /** Extraction method used */
  extract_type: ExtractType;

  /** Full extracted text (markdown or plain) */
  text: string;

  /** Overall quality assessment */
  quality: QualityHint;

  /** Estimated token count */
  token_estimate: number;

  /** Character count */
  char_count: number;

  /** Per-page text for multi-page sources */
  page_texts?: PageText[];
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Discriminated union of all artifact types
 */
export type PipelineArtifact = CaptureArtifact | RenderArtifact | ExtractArtifact;

// ============================================================================
// Selection Types
// ============================================================================

/**
 * Selection mode for artifacts
 */
export type SelectionMode =
  | 'auto' // System automatically selects based on quality/relevance
  | 'manual'; // User has manually adjusted selection

/**
 * Tracks which artifacts are selected for context inclusion
 */
export interface ArtifactSelection {
  /** Set of selected artifact IDs */
  artifact_ids: Set<string>;

  /** For multi-page sources: which pages are selected */
  selected_pages?: number[];

  /** How this selection was determined */
  mode: SelectionMode;

  /** Total estimated tokens for selected content */
  estimated_tokens: number;

  /** When selection was last modified */
  modified_at: number;
}

// ============================================================================
// Pipeline Status
// ============================================================================

/**
 * Pipeline execution status
 */
export type PipelineStatus =
  | { state: 'idle' }
  | { state: 'running'; stage: PipelineStage; progress?: number; message?: string }
  | { state: 'complete'; completed_at: number }
  | { state: 'error'; stage: PipelineStage; error: string; recoverable: boolean };

// ============================================================================
// Source Pipeline
// ============================================================================

/**
 * Basic information about the source
 */
export interface SourceInfo {
  /** Human-readable title */
  title: string;

  /** Origin URL (if applicable) */
  url?: string;

  /** Source type (webpage, pdf, image, note, chatlog) */
  type: SourceKind;

  /** Original tab ID for session reference */
  tab_id?: string;

  /** Favicon URL */
  favicon?: string;
}

/**
 * Container for all artifacts from a single source.
 * This is the complete pipeline state for one source.
 */
export interface SourcePipeline {
  /** Source ID from Context IR */
  source_id: SourceId;

  /** Source metadata */
  source_info: SourceInfo;

  /** All artifacts organized by stage */
  stages: {
    capture: CaptureArtifact[];
    render: RenderArtifact[];
    extract: ExtractArtifact[];
  };

  /** Currently selected artifacts for context */
  selection: ArtifactSelection;

  /** Pipeline execution status */
  status: PipelineStatus;

  /** When this pipeline was created */
  created_at: number;

  /** When this pipeline was last updated */
  updated_at: number;
}

// ============================================================================
// Stage Options (for regeneration UI)
// ============================================================================

/**
 * Available options for regenerating a capture stage
 */
export interface CaptureOptions {
  /** Available capture types */
  available_types: CaptureType[];

  /** Whether to include DOM snapshot */
  include_dom?: boolean;

  /** Screenshot options */
  screenshot?: {
    full_page: boolean;
    wait_for_idle: boolean;
    delay_ms?: number;
  };
}

/**
 * Available options for regenerating a render stage
 */
export interface RenderOptions {
  /** Available render types */
  available_types: RenderType[];

  /** DPI options for PDF rasterization */
  dpi_options: number[];

  /** Available output formats */
  formats: ('png' | 'jpeg' | 'webp')[];

  /** Current config */
  current_config: RenderConfig;
}

/**
 * Available options for regenerating an extract stage
 */
export interface ExtractOptions {
  /** Available extraction methods */
  available_types: ExtractType[];

  /** Whether vision-based extraction is available */
  vision_available: boolean;

  /** Whether OCR is available */
  ocr_available: boolean;

  /** Language hints for OCR */
  ocr_languages?: string[];
}

/**
 * Combined stage options (for UI display)
 */
export type StageOptions =
  | { stage: 'capture'; options: CaptureOptions }
  | { stage: 'render'; options: RenderOptions }
  | { stage: 'extract'; options: ExtractOptions };

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract artifact type for a specific stage
 */
export type ArtifactOfStage<S extends PipelineStage> = S extends 'capture'
  ? CaptureArtifact
  : S extends 'render'
    ? RenderArtifact
    : S extends 'extract'
      ? ExtractArtifact
      : never;

/**
 * Get all artifacts from a pipeline for a specific stage
 */
export function getArtifactsForStage<S extends PipelineStage>(
  pipeline: SourcePipeline,
  stage: S
): ArtifactOfStage<S>[] {
  return pipeline.stages[stage] as ArtifactOfStage<S>[];
}

/**
 * Check if an artifact is of a specific stage type
 */
export function isArtifactOfStage<S extends PipelineStage>(
  artifact: PipelineArtifact,
  stage: S
): artifact is ArtifactOfStage<S> {
  return artifact.stage === stage;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new artifact ID (uuid v4 format)
 */
export function createArtifactId(): string {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create an empty artifact selection
 */
export function createEmptySelection(): ArtifactSelection {
  return {
    artifact_ids: new Set(),
    mode: 'auto',
    estimated_tokens: 0,
    modified_at: Date.now(),
  };
}

/**
 * Create an empty source pipeline
 */
export function createEmptyPipeline(sourceId: SourceId, sourceInfo: SourceInfo): SourcePipeline {
  const now = Date.now();
  return {
    source_id: sourceId,
    source_info: sourceInfo,
    stages: {
      capture: [],
      render: [],
      extract: [],
    },
    selection: createEmptySelection(),
    status: { state: 'idle' },
    created_at: now,
    updated_at: now,
  };
}
