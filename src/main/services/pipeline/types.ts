/**
 * Pipeline Service Types
 *
 * Internal types for the pipeline service layer.
 */

import type {
  PipelineStage,
  PipelineArtifact,
  CaptureArtifact,
  RenderArtifact,
  ExtractArtifact,
  CaptureOptions,
  RenderOptions,
  ExtractOptions,
  RenderConfig,
  CaptureType,
  RenderType,
  ExtractType,
} from '../../../types/pipeline';
import type { SourceId } from '../../../types/context-ir';

/**
 * Options for running a full pipeline
 */
export interface PipelineRunOptions {
  /** Source ID to process */
  sourceId: SourceId;

  /** Tab ID for content access */
  tabId: string;

  /** Which stages to run (defaults to all) */
  stages?: PipelineStage[];

  /** Stage-specific options */
  captureOptions?: Partial<CaptureOptions>;
  renderOptions?: Partial<RenderOptions>;
  extractOptions?: Partial<ExtractOptions>;

  /** Whether to skip existing artifacts */
  skipExisting?: boolean;
}

/**
 * Result from running a single stage
 */
export interface StageResult<T extends PipelineArtifact = PipelineArtifact> {
  /** Whether the stage succeeded */
  success: boolean;

  /** The produced artifacts */
  artifacts: T[];

  /** Error message if failed */
  error?: string;

  /** Duration in milliseconds */
  duration_ms: number;
}

/**
 * Request to regenerate a specific stage
 */
export interface RegenerationRequest {
  /** Source ID */
  sourceId: SourceId;

  /** Stage to regenerate */
  stage: PipelineStage;

  /** Parent artifact IDs to use as input (if not using defaults) */
  parentArtifactIds?: string[];

  /** Stage-specific configuration */
  config?: CaptureConfig | RenderConfig | ExtractConfig;
}

/**
 * Configuration for capture stage
 */
export interface CaptureConfig {
  /** Type of capture to perform */
  type: CaptureType;

  /** For screenshots: wait for network idle */
  waitForIdle?: boolean;

  /** For screenshots: delay before capture (ms) */
  delay?: number;

  /** For screenshots: full page or viewport only */
  fullPage?: boolean;

  /** For DOM: include computed styles */
  includeStyles?: boolean;
}

/**
 * Configuration for extract stage
 */
export interface ExtractConfig {
  /** Extraction method to use */
  type: ExtractType;

  /** For OCR: language hints */
  languages?: string[];

  /** For vision: specific model to use */
  visionModel?: string;

  /** For readability: whether to include links */
  includeLinks?: boolean;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Input for capture stage
 */
export interface CaptureInput {
  /** Tab ID to capture from */
  tabId: string;

  /** Source URL */
  url: string;

  /** Source title */
  title: string;

  /** Configuration */
  config: CaptureConfig;
}

/**
 * Input for render stage
 */
export interface RenderInput {
  /** Parent capture artifact */
  capture: CaptureArtifact;

  /** Configuration */
  config: RenderConfig;
}

/**
 * Input for extract stage
 */
export interface ExtractInput {
  /** Parent render artifact (or capture for direct extraction) */
  parent: RenderArtifact | CaptureArtifact;

  /** Configuration */
  config: ExtractConfig;
}

/**
 * Pipeline execution context
 */
export interface PipelineContext {
  /** Source ID being processed */
  sourceId: SourceId;

  /** Progress callback */
  onProgress?: ProgressCallback;

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}
