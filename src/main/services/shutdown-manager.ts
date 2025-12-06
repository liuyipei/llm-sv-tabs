import { app, BrowserWindow } from 'electron';

/**
 * Cleanup callback type for custom cleanup logic.
 */
export type CleanupCallback = () => void;

/**
 * ShutdownManager handles graceful application shutdown and resource cleanup.
 *
 * It ensures that when the app is terminated (via Ctrl+C, window close, or system signals),
 * all windows are properly destroyed and no zombie processes remain.
 *
 * This is especially important on Windows where Electron's Chromium renderer processes
 * can become orphaned if not explicitly destroyed.
 */
export class ShutdownManager {
  private cleanupCallbacks: Map<string, CleanupCallback> = new Map();
  private isShuttingDown = false;
  private cleanupPerformed = false;

  /**
   * Register a cleanup callback to run during shutdown.
   * @param name Identifier for the callback (for logging)
   * @param callback The cleanup function to call
   */
  registerCleanup(name: string, callback: CleanupCallback): void {
    this.cleanupCallbacks.set(name, callback);
  }

  /**
   * Unregister a cleanup callback.
   * @param name Identifier for the callback
   */
  unregisterCleanup(name: string): void {
    this.cleanupCallbacks.delete(name);
  }

  /**
   * Perform cleanup and destroy all windows.
   * Safe to call multiple times - only executes once.
   */
  performCleanup(): void {
    if (this.cleanupPerformed) {
      return;
    }
    this.cleanupPerformed = true;
    console.log('ShutdownManager: Performing cleanup...');

    // Run all registered cleanup callbacks
    for (const [name, callback] of this.cleanupCallbacks) {
      try {
        console.log(`ShutdownManager: Running cleanup for ${name}...`);
        callback();
      } catch (error) {
        console.error(`ShutdownManager: Error in cleanup for ${name}:`, error);
      }
    }
    this.cleanupCallbacks.clear();

    // Close all windows to ensure renderer processes are terminated
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.destroy();
        } catch (error) {
          console.error('ShutdownManager: Error destroying window:', error);
        }
      }
    }
  }

  /**
   * Initiate graceful shutdown.
   * Performs cleanup and then quits the app.
   */
  shutdown(): void {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    this.performCleanup();
    app.quit();
  }

  /**
   * Setup all shutdown handlers (signals and app events).
   * Should be called once during app initialization.
   */
  setup(): void {
    // Handle SIGINT (Ctrl+C) - works on Windows through Node.js emulation
    process.on('SIGINT', () => {
      console.log('ShutdownManager: SIGINT received');
      this.shutdown();
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      console.log('ShutdownManager: SIGTERM received');
      this.shutdown();
    });

    // Cleanup before app quits (handles normal quit scenarios)
    app.on('before-quit', () => {
      console.log('ShutdownManager: before-quit event');
      this.performCleanup();
    });

    // Final exit handler - force exit if cleanup didn't work
    app.on('will-quit', (_event) => {
      console.log('ShutdownManager: will-quit event');
      // Give a small grace period then force exit
      // This ensures no zombie processes remain on Windows
      setTimeout(() => {
        console.log('ShutdownManager: Force exiting process...');
        process.exit(0);
      }, 500);
    });

    // Handle all windows closed
    app.on('window-all-closed', () => {
      console.log('ShutdownManager: window-all-closed event');
      this.performCleanup();

      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

// Singleton instance for the application
export const shutdownManager = new ShutdownManager();
