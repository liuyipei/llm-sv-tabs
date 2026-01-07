/**
 * Capture Service
 *
 * Orchestrates webpage capture using Electron's BrowserView.
 * Handles scrolling, screenshot capture, and progress reporting.
 */

import { BrowserView, type NativeImage } from 'electron';
import type {
  CaptureConfig,
  CapturedTile,
  CaptureProgress,
  CaptureWarning,
} from '../../shared/types.js';
import {
  calculateScrollStep,
  generateCaptureId,
  createTileMetadata,
  estimateTokensForTiles,
  checkCaptureWarning,
} from './tiling.js';

export interface CaptureCallbacks {
  onProgress: (progress: CaptureProgress) => void;
  onTile: (tile: CapturedTile) => void;
  onWarning: (warning: CaptureWarning) => Promise<boolean>; // Returns true to continue
  onComplete: (tiles: CapturedTile[]) => void;
  onError: (error: string) => void;
}

export interface CaptureState {
  isCapturing: boolean;
  isPaused: boolean;
  captureId: string | null;
  tiles: CapturedTile[];
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture a webpage as overlapping tiles
 */
export async function captureWebpage(
  view: BrowserView,
  config: CaptureConfig,
  callbacks: CaptureCallbacks
): Promise<void> {
  const captureId = generateCaptureId();
  const tiles: CapturedTile[] = [];
  const url = view.webContents.getURL();

  try {
    // Get document dimensions
    const dimensions = await view.webContents.executeJavaScript(`
      ({
        documentHeight: Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        ),
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      })
    `);

    const { documentHeight, viewportHeight, devicePixelRatio } = dimensions;
    const maxScrollY = Math.max(0, documentHeight - viewportHeight);
    const step = calculateScrollStep(config.viewport.height, config.overlapRatio);

    // Calculate scroll positions
    const scrollPositions: number[] = [0];
    let currentY = 0;
    while (currentY < maxScrollY) {
      currentY += step;
      if (currentY >= maxScrollY) {
        if (scrollPositions[scrollPositions.length - 1] !== maxScrollY) {
          scrollPositions.push(maxScrollY);
        }
        break;
      }
      scrollPositions.push(currentY);
    }

    const totalTiles = scrollPositions.length;

    // Capture each tile
    for (let i = 0; i < scrollPositions.length; i++) {
      const scrollY = scrollPositions[i];

      // Scroll to position
      await view.webContents.executeJavaScript(`window.scrollTo(0, ${scrollY})`);

      // Wait for content to settle
      await delay(400);

      // Capture screenshot
      const image: NativeImage = await view.webContents.capturePage();
      const imageDataUrl = image.toDataURL();

      // Create tile
      const metadata = createTileMetadata(
        i,
        totalTiles,
        scrollY,
        config,
        captureId,
        url,
        devicePixelRatio
      );

      const tile: CapturedTile = { metadata, imageDataUrl };
      tiles.push(tile);

      // Report progress
      const estimatedTokens = estimateTokensForTiles(tiles.length, config.viewport);
      const progress: CaptureProgress = {
        tile_index: i,
        scroll_y: scrollY,
        max_scroll: maxScrollY,
        estimated_tokens: estimatedTokens,
      };

      callbacks.onTile(tile);
      callbacks.onProgress(progress);

      // Check for warnings
      const warning = checkCaptureWarning(tiles.length, estimatedTokens);
      if (warning) {
        const shouldContinue = await callbacks.onWarning(warning);
        if (!shouldContinue) {
          // User chose to stop
          callbacks.onComplete(tiles);
          return;
        }
      }
    }

    // Scroll back to top
    await view.webContents.executeJavaScript('window.scrollTo(0, 0)');

    callbacks.onComplete(tiles);
  } catch (error) {
    callbacks.onError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get current scroll info from a BrowserView
 */
export async function getScrollInfo(view: BrowserView): Promise<{
  scrollY: number;
  maxScrollY: number;
  documentHeight: number;
  viewportHeight: number;
}> {
  return view.webContents.executeJavaScript(`
    ({
      scrollY: window.scrollY,
      maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    })
  `);
}
