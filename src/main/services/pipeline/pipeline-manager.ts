/**
 * Pipeline Manager
 *
 * Orchestrates the staged extraction pipeline:
 * Capture → Render → Extract
 *
 * Each stage produces artifacts that can be inspected,
 * regenerated, and selected for inclusion in model context.
 */

import type { SourceId, Anchor } from '../../../types/context-ir';
import type {
  SourcePipeline,
  PipelineStage,
  PipelineArtifact,
  CaptureArtifact,
  RenderArtifact,
  ExtractArtifact,
  SourceInfo,
} from '../../../types/pipeline';
import {
  createEmptyPipeline,
  createArtifactId,
  PIPELINE_STAGES,
} from '../../../types/pipeline';
import type {
  PipelineRunOptions,
  StageResult,
  RegenerationRequest,
  ProgressCallback,
  PipelineContext,
} from './types';

/**
 * Pipeline Manager
 *
 * Manages the lifecycle of content extraction pipelines.
 * Coordinates between capture, render, and extract stages.
 */
export class PipelineManager {
  /** In-memory pipeline storage (would be persisted in production) */
  private pipelines: Map<SourceId, SourcePipeline> = new Map();

  /**
   * Create a new pipeline for a source
   */
  createPipeline(sourceId: SourceId, sourceInfo: SourceInfo): SourcePipeline {
    const pipeline = createEmptyPipeline(sourceId, sourceInfo);
    this.pipelines.set(sourceId, pipeline);
    return pipeline;
  }

  /**
   * Get a pipeline by source ID
   */
  getPipeline(sourceId: SourceId): SourcePipeline | undefined {
    return this.pipelines.get(sourceId);
  }

  /**
   * Get all pipelines
   */
  getAllPipelines(): SourcePipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Delete a pipeline
   */
  deletePipeline(sourceId: SourceId): boolean {
    return this.pipelines.delete(sourceId);
  }

  /**
   * Run the full pipeline (all stages)
   */
  async runPipeline(
    options: PipelineRunOptions,
    onProgress?: ProgressCallback
  ): Promise<SourcePipeline> {
    const { sourceId, stages = PIPELINE_STAGES } = options;

    let pipeline = this.pipelines.get(sourceId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${sourceId}`);
    }

    const context: PipelineContext = { sourceId, onProgress };

    // Run each requested stage in sequence
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageProgress = (i + 1) / stages.length;

      onProgress?.(stageProgress * 0.9, `Running ${stage} stage...`);

      try {
        pipeline = await this.runStage(pipeline, stage, context);
      } catch (error) {
        // Update pipeline with error status
        pipeline = {
          ...pipeline,
          status: {
            state: 'error',
            stage,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true,
          },
          updated_at: Date.now(),
        };
        this.pipelines.set(sourceId, pipeline);
        throw error;
      }
    }

    // Mark as complete
    pipeline = {
      ...pipeline,
      status: { state: 'complete', completed_at: Date.now() },
      updated_at: Date.now(),
    };
    this.pipelines.set(sourceId, pipeline);

    onProgress?.(1, 'Pipeline complete');
    return pipeline;
  }

  /**
   * Run a single stage of the pipeline
   */
  private async runStage(
    pipeline: SourcePipeline,
    stage: PipelineStage,
    context: PipelineContext
  ): Promise<SourcePipeline> {
    // Update status to running
    pipeline = {
      ...pipeline,
      status: { state: 'running', stage },
      updated_at: Date.now(),
    };
    this.pipelines.set(pipeline.source_id, pipeline);

    // Run the appropriate stage
    let result: StageResult;
    switch (stage) {
      case 'capture':
        result = await this.runCaptureStage(pipeline, context);
        break;
      case 'render':
        result = await this.runRenderStage(pipeline, context);
        break;
      case 'extract':
        result = await this.runExtractStage(pipeline, context);
        break;
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }

    if (!result.success) {
      throw new Error(result.error || `${stage} stage failed`);
    }

    // Add artifacts to pipeline
    const updatedStages = {
      ...pipeline.stages,
      [stage]: [...pipeline.stages[stage], ...result.artifacts],
    };

    return {
      ...pipeline,
      stages: updatedStages,
      updated_at: Date.now(),
    };
  }

  /**
   * Regenerate a specific stage
   */
  async regenerateStage(request: RegenerationRequest): Promise<PipelineArtifact[]> {
    const { sourceId, stage } = request;

    const pipeline = this.pipelines.get(sourceId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${sourceId}`);
    }

    const context: PipelineContext = { sourceId };

    // Run the stage with custom config
    let result: StageResult;
    switch (stage) {
      case 'capture':
        result = await this.runCaptureStage(pipeline, context);
        break;
      case 'render':
        result = await this.runRenderStage(pipeline, context);
        break;
      case 'extract':
        result = await this.runExtractStage(pipeline, context);
        break;
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }

    if (!result.success) {
      throw new Error(result.error || `${stage} regeneration failed`);
    }

    // Add new artifacts to the pipeline
    const updatedStages = {
      ...pipeline.stages,
      [stage]: [...pipeline.stages[stage], ...result.artifacts],
    };

    const updatedPipeline: SourcePipeline = {
      ...pipeline,
      stages: updatedStages,
      updated_at: Date.now(),
    };

    this.pipelines.set(sourceId, updatedPipeline);
    return result.artifacts;
  }

  /**
   * Get available options for regenerating a stage
   */
  getStageOptions(sourceId: SourceId, stage: PipelineStage): object {
    const pipeline = this.pipelines.get(sourceId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${sourceId}`);
    }

    switch (stage) {
      case 'capture':
        return {
          stage: 'capture',
          options: {
            available_types: ['screenshot', 'dom_snapshot', 'pdf_bytes', 'image_bytes', 'text'],
            screenshot: {
              full_page: true,
              wait_for_idle: true,
              delay_ms: 0,
            },
          },
        };
      case 'render':
        return {
          stage: 'render',
          options: {
            available_types: ['pdf_pages', 'scrolling_screenshots', 'rasterized_pages', 'thumbnail'],
            dpi_options: [72, 150, 300],
            formats: ['png', 'jpeg', 'webp'],
            current_config: {
              dpi: 150,
              format: 'png',
            },
          },
        };
      case 'extract':
        return {
          stage: 'extract',
          options: {
            available_types: ['text_layer', 'ocr', 'vision', 'readability', 'dom_walker'],
            vision_available: true,
            ocr_available: true,
            ocr_languages: ['en'],
          },
        };
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }
  }

  /**
   * Run the capture stage
   * (Placeholder - actual implementation would use tab/BrowserView APIs)
   */
  private async runCaptureStage(
    pipeline: SourcePipeline,
    _context: PipelineContext
  ): Promise<StageResult<CaptureArtifact>> {
    const startTime = Date.now();

    // This is a placeholder implementation
    // Real implementation would:
    // 1. Get the tab content via BrowserView APIs
    // 2. Take screenshots, extract DOM, etc.
    // 3. Create proper BinaryBlob data

    const artifact: CaptureArtifact = {
      artifact_id: createArtifactId(),
      stage: 'capture',
      source_anchor: pipeline.source_id as Anchor,
      created_at: Date.now(),
      provenance: {
        method: 'placeholder',
        version: '1.0.0',
        parent_ids: [],
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      capture_type: 'text',
      data: `Placeholder capture content for ${pipeline.source_info.title}`,
      source_uri: pipeline.source_info.url || '',
      mime_type: 'text/plain',
    };

    return {
      success: true,
      artifacts: [artifact],
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Run the render stage
   * (Placeholder - actual implementation would use PDF/image rendering)
   */
  private async runRenderStage(
    pipeline: SourcePipeline,
    _context: PipelineContext
  ): Promise<StageResult<RenderArtifact>> {
    const startTime = Date.now();

    // Get parent capture artifact
    const captures = pipeline.stages.capture;
    if (captures.length === 0) {
      return {
        success: false,
        artifacts: [],
        error: 'No capture artifacts available for rendering',
        duration_ms: Date.now() - startTime,
      };
    }

    const parentCapture = captures[captures.length - 1];

    // This is a placeholder implementation
    // Real implementation would:
    // 1. Take the capture content
    // 2. Render to PDF/images
    // 3. Create proper page artifacts

    const artifact: RenderArtifact = {
      artifact_id: createArtifactId(),
      stage: 'render',
      source_anchor: pipeline.source_id as Anchor,
      created_at: Date.now(),
      provenance: {
        method: 'placeholder',
        version: '1.0.0',
        parent_ids: [parentCapture.artifact_id],
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      render_type: 'rasterized_pages',
      pages: [],
      render_config: {
        dpi: 150,
        format: 'png',
      },
      page_count: 0,
    };

    return {
      success: true,
      artifacts: [artifact],
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Run the extract stage
   * (Placeholder - actual implementation would use text extraction)
   */
  private async runExtractStage(
    pipeline: SourcePipeline,
    _context: PipelineContext
  ): Promise<StageResult<ExtractArtifact>> {
    const startTime = Date.now();

    // Get parent artifacts (prefer render, fallback to capture)
    const renders = pipeline.stages.render;
    const captures = pipeline.stages.capture;

    const parentIds: string[] = [];
    if (renders.length > 0) {
      parentIds.push(renders[renders.length - 1].artifact_id);
    } else if (captures.length > 0) {
      parentIds.push(captures[captures.length - 1].artifact_id);
    }

    // This is a placeholder implementation
    // Real implementation would:
    // 1. Get the parent artifact content
    // 2. Extract text using appropriate method
    // 3. Compute quality hints and token estimates

    const text = `Placeholder extracted text for ${pipeline.source_info.title}

This would contain the actual extracted content from the source.
The extraction would use methods like:
- Readability for articles
- DOM walker for apps
- PDF.js text layer for PDFs
- OCR for images
- Vision models for complex layouts`;

    const artifact: ExtractArtifact = {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: pipeline.source_id as Anchor,
      created_at: Date.now(),
      provenance: {
        method: 'placeholder',
        version: '1.0.0',
        parent_ids: parentIds,
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'readability',
      text,
      quality: 'good',
      token_estimate: Math.ceil(text.length / 4),
      char_count: text.length,
    };

    return {
      success: true,
      artifacts: [artifact],
      duration_ms: Date.now() - startTime,
    };
  }
}
