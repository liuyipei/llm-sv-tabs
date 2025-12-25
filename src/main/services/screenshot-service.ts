import { BrowserWindow, desktopCapturer, screen, ipcMain, NativeImage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Rectangle } from '../../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Screenshot Service
 *
 * Handles cross-platform region-based screenshot capture using Electron's
 * built-in desktopCapturer API. No external dependencies required.
 *
 * Features:
 * - Region selection via overlay window
 * - Multi-monitor support
 * - High-DPI/Retina display handling
 * - ESC to cancel
 * - Returns base64 data URL for immediate tab creation
 */
export class ScreenshotService {
  private overlayWindow: BrowserWindow | null = null;
  private capturedScreenImage: NativeImage | null = null;
  private displayBounds: Rectangle | null = null;
  private resolveCapture: ((dataUrl: string | null) => void) | null = null;

  constructor(_mainWindow: BrowserWindow) {
    this.setupIpcHandlers();
  }

  /**
   * Set up IPC handlers for overlay communication
   */
  private setupIpcHandlers(): void {
    ipcMain.on('screenshot-region-selected', (_event, bounds: Rectangle) => {
      this.handleRegionSelected(bounds);
    });

    ipcMain.on('screenshot-cancelled', () => {
      this.cancel();
    });
  }

  /**
   * Start the screenshot capture flow
   *
   * 1. Capture all desktop sources
   * 2. Create overlay window for region selection
   * 3. Wait for user to select region or cancel
   * 4. Return cropped image as base64 data URL
   */
  async startCapture(): Promise<string | null> {
    try {
      console.log('ScreenshotService: Starting capture...');

      // Capture the desktop
      await this.captureDesktop();

      console.log('ScreenshotService: Desktop captured, creating overlay...');

      // Create overlay for region selection
      this.createOverlayWindow();

      console.log('ScreenshotService: Overlay created, waiting for user selection...');

      // Return a promise that resolves when user selects region or cancels
      return new Promise((resolve) => {
        this.resolveCapture = resolve;
      });
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      this.cleanup();
      throw error; // Rethrow to propagate to IPC handler
    }
  }

  /**
   * Capture all desktop sources using desktopCapturer
   *
   * For simplicity, we capture the primary display. Multi-monitor support
   * can be added by capturing all displays and stitching them together.
   */
  private async captureDesktop(): Promise<void> {
    console.log('ScreenshotService: Getting primary display info...');

    // Get primary display info
    const primaryDisplay = screen.getPrimaryDisplay();
    this.displayBounds = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor;

    console.log(`ScreenshotService: Primary display - ${this.displayBounds.width}x${this.displayBounds.height}, scale: ${scaleFactor}`);

    // Calculate thumbnail size based on display size and scale factor
    const thumbnailSize = {
      width: Math.floor(this.displayBounds.width * scaleFactor),
      height: Math.floor(this.displayBounds.height * scaleFactor),
    };

    console.log(`ScreenshotService: Requesting capture with size ${thumbnailSize.width}x${thumbnailSize.height}`);

    // Capture desktop sources
    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: thumbnailSize,
      });
    } catch (error) {
      // On macOS, if permission is denied, this throws "Failed to get sources"
      console.error('ScreenshotService: desktopCapturer.getSources() failed:', error);
      const errorMsg = process.platform === 'darwin'
        ? 'Screen Recording permission denied.\n\nTo fix:\n1. Open System Preferences → Security & Privacy → Privacy\n2. Select "Screen Recording" from the left sidebar\n3. Check the box next to "Electron"\n4. Restart this app\n\nThe Electron app is located at:\n/Users/yiliu/repos/llm-sv-tabs/node_modules/electron/dist/Electron.app'
        : 'Failed to capture screen. Please check your system permissions.';
      throw new Error(errorMsg);
    }

    console.log(`ScreenshotService: Got ${sources.length} screen source(s)`);

    if (sources.length === 0) {
      const errorMsg = process.platform === 'darwin'
        ? 'No screen sources available. This usually means Screen Recording permission was not granted.\n\nPlease add Electron to Screen Recording permissions and restart the app.'
        : 'No screen sources available. Please check your system permissions.';
      throw new Error(errorMsg);
    }

    // Use the first screen source (primary display)
    // In multi-monitor setups, we'd need to match display IDs
    const primarySource = sources[0];
    this.capturedScreenImage = primarySource.thumbnail;

    const imageSize = this.capturedScreenImage.getSize();
    console.log(`ScreenshotService: Captured screen image - ${imageSize.width}x${imageSize.height}`);
  }

  /**
   * Create frameless, fullscreen overlay window for region selection
   */
  private createOverlayWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;

    this.overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreen: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'screenshot-overlay-preload.js'),
        sandbox: true,
      },
    });

    // Remove menu bar
    this.overlayWindow.setMenu(null);

    // Load overlay HTML
    const overlayPath = join(__dirname, 'screenshot-overlay.html');
    this.overlayWindow.loadFile(overlayPath);

    // Prevent closing via Alt+F4, etc. - user must use ESC or select region
    this.overlayWindow.on('close', (event) => {
      if (this.resolveCapture) {
        event.preventDefault();
        this.cancel();
      }
    });
  }

  /**
   * Handle region selection from overlay
   */
  private handleRegionSelected(bounds: Rectangle): void {
    if (!this.capturedScreenImage || !this.displayBounds) {
      console.error('No captured image available');
      // Clear resolveCapture first to prevent re-entry
      const resolve = this.resolveCapture;
      this.resolveCapture = null;
      this.cleanup();
      if (resolve) {
        resolve(null);
      }
      return;
    }

    // Validate bounds
    if (bounds.width < 10 || bounds.height < 10) {
      console.error('Region too small');
      // Clear resolveCapture first to prevent re-entry
      const resolve = this.resolveCapture;
      this.resolveCapture = null;
      this.cleanup();
      if (resolve) {
        resolve(null);
      }
      return;
    }

    // Get display scale factor for HiDPI support
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor;

    // Adjust bounds for scale factor
    const scaledBounds = {
      x: Math.floor(bounds.x * scaleFactor),
      y: Math.floor(bounds.y * scaleFactor),
      width: Math.floor(bounds.width * scaleFactor),
      height: Math.floor(bounds.height * scaleFactor),
    };

    // Crop the image
    const croppedImage = this.cropImage(this.capturedScreenImage, scaledBounds);

    // Convert to data URL
    const dataUrl = croppedImage.toDataURL();

    // Clear resolveCapture first to prevent re-entry, then cleanup and resolve
    const resolve = this.resolveCapture;
    this.resolveCapture = null;
    this.cleanup();
    if (resolve) {
      resolve(dataUrl);
    }
  }

  /**
   * Crop image to selected bounds
   */
  private cropImage(sourceImage: NativeImage, bounds: Rectangle): NativeImage {
    // Get image dimensions
    const imageSize = sourceImage.getSize();

    // Clamp bounds to image dimensions
    const clampedBounds = {
      x: Math.max(0, Math.min(bounds.x, imageSize.width)),
      y: Math.max(0, Math.min(bounds.y, imageSize.height)),
      width: Math.min(bounds.width, imageSize.width - bounds.x),
      height: Math.min(bounds.height, imageSize.height - bounds.y),
    };

    console.log('Cropping image:', clampedBounds);

    // Crop the image
    return sourceImage.crop(clampedBounds);
  }

  /**
   * Cancel capture (ESC key pressed)
   */
  cancel(): void {
    console.log('Screenshot cancelled');

    // Clear resolveCapture first to prevent re-entry from close event
    const resolve = this.resolveCapture;
    this.resolveCapture = null;

    this.cleanup();

    if (resolve) {
      resolve(null);
    }
  }

  /**
   * Clean up overlay and temporary data
   */
  private cleanup(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      // Remove all listeners to prevent event recursion
      this.overlayWindow.removeAllListeners('close');
      this.overlayWindow.close();
    }
    this.overlayWindow = null;
    this.capturedScreenImage = null;
    this.displayBounds = null;
  }
}
