/**
 * Shared types for the capture-tiles experiment
 */

/**
 * Viewport dimensions
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Capture configuration
 */
export interface CaptureConfig {
  viewport: Viewport;
  overlapRatio: number; // 0.10 - 0.20
}

/**
 * Metadata for a single captured tile
 */
export interface TileMetadata {
  tile_index: number;
  tile_count: number;
  scroll_y_px: number;
  viewport_px: string;
  overlap_ratio: number;
  capture_id: string;
  url: string;
  timestamp: number;
  device_pixel_ratio?: number;
}

/**
 * A captured tile with image data and metadata
 */
export interface CapturedTile {
  metadata: TileMetadata;
  imageDataUrl: string; // base64 PNG data URL
}

/**
 * Capture session state
 */
export interface CaptureSession {
  capture_id: string;
  url: string;
  config: CaptureConfig;
  tiles: CapturedTile[];
  started_at: number;
  completed_at?: number;
  status: 'idle' | 'capturing' | 'paused' | 'complete' | 'error';
  error?: string;
}

/**
 * Warning types during capture
 */
export type CaptureWarning =
  | { type: 'tile_limit'; count: number }
  | { type: 'token_limit'; estimated: number };

/**
 * Capture progress update
 */
export interface CaptureProgress {
  tile_index: number;
  scroll_y: number;
  max_scroll: number;
  estimated_tokens: number;
  warning?: CaptureWarning;
}

/**
 * Export format options
 */
export interface ExportOptions {
  format: 'files' | 'clipboard' | 'both';
  outputDir?: string;
  includeMetadata: boolean;
  includePreamble: boolean;
}

/**
 * LLM preamble for tile batches
 */
export const TILE_PREAMBLE = `The following images are sequential vertical screenshot tiles of the same webpage,
captured from top to bottom using a fixed viewport.

Adjacent tiles overlap by ~15% vertically, so some text and UI elements repeat.
Please treat the tiles as a continuous document, deduplicate repeated content,
and ignore persistent UI elements such as headers or navigation bars.`;

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  // Renderer -> Main
  NAVIGATE: 'capture:navigate',
  START_CAPTURE: 'capture:start',
  STOP_CAPTURE: 'capture:stop',
  CONTINUE_CAPTURE: 'capture:continue',
  EXPORT_TILES: 'capture:export',

  // Main -> Renderer
  NAVIGATION_STATE: 'capture:navigation-state',
  CAPTURE_PROGRESS: 'capture:progress',
  CAPTURE_TILE: 'capture:tile',
  CAPTURE_COMPLETE: 'capture:complete',
  CAPTURE_WARNING: 'capture:warning',
  CAPTURE_ERROR: 'capture:error',
} as const;

/**
 * Navigation state from main process
 */
export interface NavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}
