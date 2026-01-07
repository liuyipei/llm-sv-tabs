/**
 * Pipeline Service
 *
 * Handles staged content extraction pipelines.
 * Provides regeneration and artifact management.
 *
 * See docs/design/19-content-normalization-ui.md for full design.
 */

export { PipelineManager } from './pipeline-manager';
export { CaptureService } from './capture-service';
export { RenderService } from './render-service';
export { ExtractService } from './extract-service';

export type {
  PipelineRunOptions,
  StageResult,
  RegenerationRequest,
} from './types';
