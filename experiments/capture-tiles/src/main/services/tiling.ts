/**
 * Tiling Logic
 *
 * Pure functions for calculating scroll positions, tile metadata,
 * and checking capture limits. No Electron dependencies.
 */

import type { Viewport, TileMetadata, CaptureConfig, CaptureWarning } from '../../shared/types.js';

/**
 * Calculate the scroll step based on viewport height and overlap ratio
 */
export function calculateScrollStep(viewportHeight: number, overlapRatio: number): number {
  return Math.floor(viewportHeight * (1 - overlapRatio));
}

/**
 * Calculate all scroll positions for a page
 * @param maxScrollY - Maximum scroll position (document height - viewport height)
 * @param viewportHeight - Height of the viewport
 * @param overlapRatio - Overlap ratio (0.10 - 0.20)
 * @returns Array of scroll Y positions
 */
export function calculateScrollPositions(
  maxScrollY: number,
  viewportHeight: number,
  overlapRatio: number
): number[] {
  const step = calculateScrollStep(viewportHeight, overlapRatio);
  const positions: number[] = [0]; // Always start at top

  let currentY = 0;
  while (currentY < maxScrollY) {
    currentY += step;
    if (currentY >= maxScrollY) {
      // Ensure we capture the very bottom
      if (positions[positions.length - 1] !== maxScrollY) {
        positions.push(maxScrollY);
      }
      break;
    }
    positions.push(currentY);
  }

  return positions;
}

/**
 * Estimate the number of tiles needed for a page
 */
export function estimateTileCount(
  documentHeight: number,
  viewportHeight: number,
  overlapRatio: number
): number {
  if (documentHeight <= viewportHeight) return 1;

  const step = calculateScrollStep(viewportHeight, overlapRatio);
  const maxScrollY = documentHeight - viewportHeight;

  return Math.ceil(maxScrollY / step) + 1;
}

/**
 * Estimate tokens for a set of tiles
 * Based on typical vision model token costs for images
 * Rough estimate: ~1000 tokens per 1440x900 image at high detail
 */
export function estimateTokensForTiles(tileCount: number, viewport: Viewport): number {
  // Base tokens per tile (high detail mode for most vision models)
  // OpenAI: ~765 tokens for 1024x1024, scales with size
  // Anthropic: similar
  // We use a conservative estimate of ~1000 tokens per standard viewport tile
  const baseTokensPerTile = 1000;

  // Scale based on viewport size relative to 1440x900
  const standardPixels = 1440 * 900;
  const actualPixels = viewport.width * viewport.height;
  const scaleFactor = actualPixels / standardPixels;

  return Math.ceil(tileCount * baseTokensPerTile * scaleFactor);
}

/**
 * Check if a warning should be shown based on current capture state
 * @param tileCount - Current number of tiles
 * @param estimatedTokens - Current estimated tokens
 * @param tileLimit - Tile count at which to warn (default 20)
 * @param tokenLimit - Token count at which to warn (default 32000)
 * @returns Warning if applicable, null otherwise
 */
export function checkCaptureWarning(
  tileCount: number,
  estimatedTokens: number,
  tileLimit: number = 20,
  tokenLimit: number = 32000
): CaptureWarning | null {
  // Check token limit first (harder limit)
  if (estimatedTokens >= tokenLimit) {
    return { type: 'token_limit', estimated: estimatedTokens };
  }

  // Check tile limit (warn at 20, then every 20)
  if (tileCount > 0 && tileCount % tileLimit === 0) {
    return { type: 'tile_limit', count: tileCount };
  }

  return null;
}

/**
 * Generate a unique capture ID
 */
export function generateCaptureId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create metadata for a tile
 */
export function createTileMetadata(
  tileIndex: number,
  tileCount: number,
  scrollY: number,
  config: CaptureConfig,
  captureId: string,
  url: string,
  devicePixelRatio?: number
): TileMetadata {
  return {
    tile_index: tileIndex,
    tile_count: tileCount,
    scroll_y_px: scrollY,
    viewport_px: `${config.viewport.width}x${config.viewport.height}`,
    overlap_ratio: config.overlapRatio,
    capture_id: captureId,
    url,
    timestamp: Date.now(),
    device_pixel_ratio: devicePixelRatio,
  };
}

/**
 * Format tile metadata as a text label for LLM context
 */
export function formatTileLabel(metadata: TileMetadata): string {
  return `[Tile ${String(metadata.tile_index + 1).padStart(2, '0')}/${String(metadata.tile_count).padStart(2, '0')}]
url=${metadata.url}
scroll_y_px=${metadata.scroll_y_px}
viewport=${metadata.viewport_px}
overlap=${metadata.overlap_ratio}
capture_id=${metadata.capture_id}`;
}

/**
 * Validate capture configuration
 */
export function validateConfig(config: CaptureConfig): string[] {
  const errors: string[] = [];

  if (config.viewport.width < 320 || config.viewport.width > 3840) {
    errors.push('Viewport width must be between 320 and 3840');
  }

  if (config.viewport.height < 240 || config.viewport.height > 2160) {
    errors.push('Viewport height must be between 240 and 2160');
  }

  if (config.overlapRatio < 0.1 || config.overlapRatio > 0.2) {
    errors.push('Overlap ratio must be between 0.10 and 0.20');
  }

  return errors;
}

/**
 * Default capture configuration
 */
export const DEFAULT_CONFIG: CaptureConfig = {
  viewport: { width: 1440, height: 900 },
  overlapRatio: 0.15,
};
