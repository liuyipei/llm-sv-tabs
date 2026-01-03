/**
 * Type exports for the experiment
 *
 * Re-exports types from the main app for use in the experiment.
 * Some types are simplified or extended for experimentation.
 */

// Re-export core Context IR types
export type {
  SourceId,
  Anchor,
  QualityHint,
  BinaryBlob,
  SourceKind,
} from '$app-types/context-ir';

// Re-export pipeline types
export type {
  PipelineStage,
  PipelineArtifact,
  CaptureArtifact,
  RenderArtifact,
  ExtractArtifact,
  RenderedPage,
  PageText,
  RenderConfig,
  ArtifactProvenance,
  ArtifactSelection,
  PipelineStatus,
  SourcePipeline,
  SourceInfo,
  CaptureType,
  RenderType,
  ExtractType,
} from '$app-types/pipeline';

export {
  PIPELINE_STAGES,
  createArtifactId,
  createEmptyPipeline,
  createEmptySelection,
} from '$app-types/pipeline';

// Experiment-specific types

/**
 * Source input for creating a new pipeline
 */
export interface SourceInput {
  /** Type of source */
  type: 'pdf' | 'image' | 'url' | 'text';
  /** Display name */
  name: string;
  /** The source data */
  data: File | string | ArrayBuffer;
  /** Optional URL */
  url?: string;
}

/**
 * Conversion request
 */
export interface ConversionRequest {
  /** Source artifact to convert */
  sourceArtifactId: string;
  /** Target format */
  targetType: 'image' | 'text' | 'pdf';
  /** Conversion method */
  method: string;
  /** Method-specific options */
  options?: Record<string, unknown>;
}

/**
 * LLM extraction request
 */
export interface LLMExtractionRequest {
  /** Image data (base64 or data URL) */
  image: string;
  /** Extraction prompt */
  prompt: string;
  /** Model to use */
  model: string;
  /** Provider */
  provider: 'openai' | 'anthropic' | 'ollama';
  /** API key (for remote providers) */
  apiKey?: string;
}

/**
 * LLM extraction result
 */
export interface LLMExtractionResult {
  /** Extracted text */
  text: string;
  /** Token usage */
  tokens: {
    input: number;
    output: number;
  };
  /** Processing time (ms) */
  duration: number;
  /** Model used */
  model: string;
}

/**
 * Experiment configuration
 */
export interface ExperimentConfig {
  /** OpenAI API key */
  openaiKey?: string;
  /** Anthropic API key */
  anthropicKey?: string;
  /** Ollama base URL */
  ollamaUrl?: string;
  /** Default DPI for PDF rendering */
  defaultDpi: number;
  /** Default image format */
  defaultImageFormat: 'png' | 'jpeg' | 'webp';
}

/**
 * Tab for the experiment UI
 */
export type ExperimentTab = 'upload' | 'pipeline' | 'convert' | 'llm' | 'preview';
