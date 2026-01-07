/**
 * Capture Tiles - Electron Main Process
 *
 * Minimal Electron app for capturing webpages as overlapping screenshot tiles.
 */

import { app, BrowserWindow, BrowserView, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { captureWebpage } from './services/capture.js';
import {
  IPC_CHANNELS,
  type CaptureConfig,
  type CapturedTile,
  type NavigationState,
  type ExportOptions,
  TILE_PREAMBLE,
} from '../shared/types.js';

let mainWindow: BrowserWindow | null = null;
let targetView: BrowserView | null = null;
let isCapturing = false;

// Panel width for the UI on the right side
const PANEL_WIDTH = 400;
const MIN_WINDOW_WIDTH = 1200;
const MIN_WINDOW_HEIGHT = 800;

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: MIN_WINDOW_WIDTH,
    height: MIN_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, 'preload.bundle.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Capture Tiles',
  });

  // Create the target BrowserView for webpage rendering
  targetView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.addBrowserView(targetView);
  updateViewBounds();

  // Load the renderer UI
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Update view bounds when window resizes
  mainWindow.on('resize', updateViewBounds);

  // Handle navigation events from the target view
  targetView.webContents.on('did-navigate', sendNavigationState);
  targetView.webContents.on('did-navigate-in-page', sendNavigationState);
  targetView.webContents.on('did-start-loading', sendNavigationState);
  targetView.webContents.on('did-stop-loading', sendNavigationState);
  targetView.webContents.on('page-title-updated', sendNavigationState);

  // Open external links in default browser
  targetView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    targetView = null;
  });
}

/**
 * Update the BrowserView bounds to fit the window
 */
function updateViewBounds(): void {
  if (!mainWindow || !targetView) return;

  const [width, height] = mainWindow.getContentSize();
  const viewWidth = width - PANEL_WIDTH;

  // Position the BrowserView on the left side
  targetView.setBounds({
    x: 0,
    y: 0,
    width: Math.max(viewWidth, 400),
    height: height,
  });
}

/**
 * Send current navigation state to renderer
 */
function sendNavigationState(): void {
  if (!mainWindow || !targetView) return;

  const state: NavigationState = {
    url: targetView.webContents.getURL(),
    title: targetView.webContents.getTitle(),
    canGoBack: targetView.webContents.canGoBack(),
    canGoForward: targetView.webContents.canGoForward(),
    isLoading: targetView.webContents.isLoading(),
  };

  mainWindow.webContents.send(IPC_CHANNELS.NAVIGATION_STATE, state);
}

/**
 * Set up IPC handlers
 */
function setupIPC(): void {
  // Navigate to URL
  ipcMain.handle(IPC_CHANNELS.NAVIGATE, async (_event, url: string) => {
    if (!targetView) return { success: false, error: 'No view' };

    try {
      // Add protocol if missing
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      await targetView.webContents.loadURL(normalizedUrl);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Start capture
  ipcMain.handle(IPC_CHANNELS.START_CAPTURE, async (_event, config: CaptureConfig) => {
    if (!targetView || !mainWindow) {
      return { success: false, error: 'No view available' };
    }

    if (isCapturing) {
      return { success: false, error: 'Capture already in progress' };
    }

    isCapturing = true;

    // Resize view to match capture viewport
    targetView.setBounds({
      x: 0,
      y: 0,
      width: config.viewport.width,
      height: config.viewport.height,
    });

    // Small delay to let the resize take effect
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      await captureWebpage(targetView, config, {
        onProgress: (progress) => {
          mainWindow?.webContents.send(IPC_CHANNELS.CAPTURE_PROGRESS, progress);
        },
        onTile: (tile) => {
          mainWindow?.webContents.send(IPC_CHANNELS.CAPTURE_TILE, tile);
        },
        onWarning: async (warning) => {
          mainWindow?.webContents.send(IPC_CHANNELS.CAPTURE_WARNING, warning);
          // For now, always continue - the renderer can implement pause/stop later
          return true;
        },
        onComplete: (tiles) => {
          mainWindow?.webContents.send(IPC_CHANNELS.CAPTURE_COMPLETE, tiles);
          isCapturing = false;
          // Restore view bounds
          updateViewBounds();
        },
        onError: (error) => {
          mainWindow?.webContents.send(IPC_CHANNELS.CAPTURE_ERROR, error);
          isCapturing = false;
          updateViewBounds();
        },
      });

      return { success: true };
    } catch (error) {
      isCapturing = false;
      updateViewBounds();
      return { success: false, error: String(error) };
    }
  });

  // Stop capture
  ipcMain.handle(IPC_CHANNELS.STOP_CAPTURE, async () => {
    isCapturing = false;
    updateViewBounds();
    return { success: true };
  });

  // Export tiles
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_TILES,
    async (_event, tiles: CapturedTile[], options: ExportOptions) => {
      if (!mainWindow) return { success: false, error: 'No window' };

      try {
        if (options.format === 'files' || options.format === 'both') {
          // Ask user for directory
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Select Export Directory',
          });

          if (result.canceled || !result.filePaths[0]) {
            return { success: false, error: 'Export cancelled' };
          }

          const outputDir = result.filePaths[0];
          const captureId = tiles[0]?.metadata.capture_id || 'capture';

          // Create subdirectory for this capture
          const captureDir = path.join(outputDir, captureId);
          if (!fs.existsSync(captureDir)) {
            fs.mkdirSync(captureDir, { recursive: true });
          }

          // Save preamble if requested
          if (options.includePreamble) {
            fs.writeFileSync(path.join(captureDir, 'preamble.txt'), TILE_PREAMBLE);
          }

          // Save each tile
          for (const tile of tiles) {
            const filename = `tile-${String(tile.metadata.tile_index).padStart(3, '0')}.png`;
            const imageData = tile.imageDataUrl.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(path.join(captureDir, filename), imageData, 'base64');

            if (options.includeMetadata) {
              const metaFilename = `tile-${String(tile.metadata.tile_index).padStart(3, '0')}.json`;
              fs.writeFileSync(
                path.join(captureDir, metaFilename),
                JSON.stringify(tile.metadata, null, 2)
              );
            }
          }

          // Save combined metadata
          if (options.includeMetadata) {
            const allMetadata = tiles.map((t) => t.metadata);
            fs.writeFileSync(
              path.join(captureDir, 'metadata.json'),
              JSON.stringify(allMetadata, null, 2)
            );
          }

          return { success: true, path: captureDir };
        }

        // Clipboard export handled in renderer (Electron clipboard API is limited for images)
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );
}

// App lifecycle
app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
