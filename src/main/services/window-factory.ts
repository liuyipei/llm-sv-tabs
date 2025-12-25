import { BrowserWindow } from 'electron';
import { join } from 'path';
import type TabManager from '../tab-manager.js';
import type { WindowId } from '../tab-manager/window-registry.js';

export interface WindowFactoryConfig {
  preloadPath: string;
  distPath: string;
  devServerUrl?: string;
}

export interface WindowFactoryDeps {
  getTabManager: () => TabManager;
}

/**
 * Factory for creating and configuring BrowserWindows.
 * Centralizes window creation logic and ensures consistent configuration.
 */
export class WindowFactory {
  private config: WindowFactoryConfig;
  private deps: WindowFactoryDeps;

  constructor(config: WindowFactoryConfig, deps: WindowFactoryDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Create the standard BrowserWindow configuration used by all windows.
   */
  private createWindowConfig(): Electron.BrowserWindowConstructorOptions {
    return {
      width: 1400,
      height: 900,
      webPreferences: {
        preload: this.config.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    };
  }

  /**
   * Load the UI into a BrowserWindow (dev server in development, built files in production).
   */
  private loadUI(window: BrowserWindow): void {
    if (this.config.devServerUrl) {
      window.loadURL(this.config.devServerUrl);
    } else {
      window.loadFile(join(this.config.distPath, 'index.html'));
    }
  }

  /**
   * Create a new browser window with its own tabs.
   * @param url Optional URL to open in the new window
   * @returns The window ID and optionally the tab ID if a URL was provided
   */
  async createWindow(url?: string): Promise<{ windowId: WindowId; tabId?: string }> {
    const newWindow = new BrowserWindow(this.createWindowConfig());
    this.loadUI(newWindow);

    // Register the window with the tab manager
    const tabManager = this.deps.getTabManager();
    const windowId = tabManager.registerNewWindow(newWindow, false);

    // If a URL was provided, open it in the new window after the UI loads
    let tabId: string | undefined;
    if (url) {
      // Wait for the window to be ready before opening the URL
      await new Promise<void>((resolve) => {
        newWindow.webContents.once('did-finish-load', () => {
          resolve();
        });
      });
      const result = tabManager.openUrlInWindow(url, windowId);
      tabId = result.tabId;
    }

    return { windowId, tabId };
  }

  /**
   * Create the primary/main browser window.
   * Unlike createWindow(), this returns the BrowserWindow directly
   * and does not register it with TabManager (the caller should do that).
   */
  createPrimaryWindow(): BrowserWindow {
    const window = new BrowserWindow(this.createWindowConfig());
    this.loadUI(window);

    // Open DevTools in development
    if (this.config.devServerUrl) {
      window.webContents.openDevTools();
    }

    return window;
  }

  /**
   * Set up callbacks on TabManager for window creation operations.
   * This connects keyboard shortcuts and context menu actions to window creation.
   */
  setupTabManagerCallbacks(): void {
    const tabManager = this.deps.getTabManager();

    // Callback for opening URLs in new windows (context menu, shift+click)
    tabManager.setOpenUrlInNewWindowCallback(async (url: string) => {
      await this.createWindow(url);
    });

    // Callback for opening blank new windows (Ctrl+N)
    tabManager.setOpenNewWindowCallback(async () => {
      await this.createWindow();
    });
  }
}
