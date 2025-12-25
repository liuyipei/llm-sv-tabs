import { app, BrowserWindow, dialog, session } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { shutdownManager } from './services/shutdown-manager.js';
import { tempFileService } from './services/temp-file-service.js';
import { configureSessionSecurity } from './session-security.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';
import type { MainProcessContext } from './ipc/register-ipc-handlers.js';
import { initSmokeTestExit } from './smoke-test-exit.js';
import type { SmokeTestExitControls } from './smoke-test-exit.js';
import type { WindowId } from './tab-manager/window-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check for smoke test mode (used in CI to verify app starts correctly)
const isSmokeTest = process.argv.includes('--smoke-test');

let mainWindow: BrowserWindow | null = null;
let preloadPath: string;
const appContext: MainProcessContext = {
  tabManager: null,
  bookmarkManager: null,
  screenshotService: null,
  createNewWindow: null,
};
let sessionSecurityConfigured = false;
let smokeTestExit: SmokeTestExitControls | null = null;

async function createWindow(): Promise<void> {
  preloadPath = join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // In development, load from Vite dev server
  // In production, load from built files
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  // In smoke test mode, exit after window loads successfully
  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      smokeTestExit?.handleWindowLoaded();
    });
  }

  // Initialize tab manager
  appContext.tabManager = new TabManager(mainWindow);

  // Initialize bookmark manager
  appContext.bookmarkManager = new BookmarkManager();

  // Initialize screenshot service
  appContext.screenshotService = new ScreenshotService(mainWindow);

  // Restore session or open default homepage
  const sessionRestored = await appContext.tabManager.restoreSession();
  if (!sessionRestored) {
    // No saved session, open default homepage
    appContext.tabManager.openUrl('https://www.google.com');
  }

  // Handle window close - cleanup refs
  mainWindow.on('closed', () => {
    appContext.tabManager = null;
    mainWindow = null;
    appContext.screenshotService = null;
  });

  // Set up the createNewWindow function now that we have the preload path
  appContext.createNewWindow = createNewBrowserWindow;

  // Set the callback on TabManager for opening URLs in new windows (context menu, shift+click)
  appContext.tabManager.setOpenUrlInNewWindowCallback(async (url: string) => {
    await createNewBrowserWindow(url);
  });

  // Set the callback on TabManager for opening blank new windows (Ctrl+N)
  appContext.tabManager.setOpenNewWindowCallback(async () => {
    await createNewBrowserWindow();
  });
}

/**
 * Create a new browser window with its own tabs.
 * @param url Optional URL to open in the new window
 * @returns The window ID and optionally the tab data if a URL was provided
 */
async function createNewBrowserWindow(url?: string): Promise<{ windowId: WindowId; tabId?: string }> {
  const newWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the UI
  if (process.env.VITE_DEV_SERVER_URL) {
    newWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    newWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  // Register the window with the tab manager
  const windowId = appContext.tabManager!.registerNewWindow(newWindow, false);

  // If a URL was provided, open it in the new window after the UI loads
  let tabId: string | undefined;
  if (url) {
    // Wait for the window to be ready before opening the URL
    await new Promise<void>((resolve) => {
      newWindow.webContents.once('did-finish-load', () => {
        resolve();
      });
    });
    const result = appContext.tabManager!.openUrlInWindow(url, windowId);
    tabId = result.tabId;
  }

  return { windowId, tabId };
}

function setupDownloadHandler(): void {
  // Handle downloads from WebContentsViews
  session.defaultSession.on('will-download', (_event, item, _webContents) => {
    // Show save dialog
    const savePath = dialog.showSaveDialogSync(mainWindow!, {
      defaultPath: item.getFilename(),
    });

    if (savePath) {
      item.setSavePath(savePath);
    } else {
      // User cancelled, cancel the download
      item.cancel();
    }

    // Handle download events
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        console.log('Download completed successfully');
      } else {
        console.log(`Download failed: ${state}`);
      }
    });
  });
}

/**
 * Global shortcuts setup (currently disabled).
 *
 * This function previously used Electron's globalShortcut API to register
 * OS-level keyboard shortcuts that would intercept keys before any webContents
 * received them. This worked well but was replaced with a different approach:
 *
 * We now use `before-input-event` handlers on each WebContentsView to capture
 * shortcuts when the browser content is focused, combined with renderer-level
 * keyboard handlers for when the UI panel is focused. This provides the same
 * functionality without using global shortcuts.
 *
 * The global shortcut approach could be re-enabled if needed by uncommenting
 * the registration code below. Global shortcuts are registered on window focus
 * and unregistered on blur to avoid stealing OS-wide shortcuts.
 *
 * Shortcuts handled:
 * - Ctrl/Cmd+F: Find in page
 * - Ctrl/Cmd+W: Close active tab
 * - Ctrl/Cmd+T: New tab (focus URL bar)
 * - Ctrl/Cmd+R: Reload current tab
 * - Ctrl/Cmd+L: Focus URL bar
 * - Ctrl/Cmd+.: Focus LLM input
 * - Ctrl/Cmd+D: Bookmark current tab
 * - Ctrl/Cmd+Alt+S: Screenshot
 * - Alt+Left/Right, Cmd+[/]: Navigation back/forward
 * - Ctrl+Tab, Ctrl+Shift+Tab: Tab switching
 * - Cmd+Alt+Left/Right (Mac): Tab switching
 */
function setupGlobalShortcuts(): void {
  // Global shortcuts are currently disabled. Keyboard shortcuts are now handled by:
  // 1. Renderer-level handlers in keyboard-shortcuts.ts (when UI panel is focused)
  // 2. before-input-event handlers on WebContentsView (when browser content is focused)
  //
  // To re-enable global shortcuts, uncomment the code below and the focus/blur handlers.
  console.log('Global shortcuts disabled - using before-input-event handlers instead');
}

// Disable client hints that would reveal "Electron" in the Sec-CH-UA header.
// configureSessionSecurity sets a Chrome-like user agent so browsing appears as a real browser.
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

app.whenReady().then(async () => {
  // Setup shutdown handlers first to catch early termination
  shutdownManager.setup();

  if (isSmokeTest) {
    smokeTestExit = initSmokeTestExit(app, shutdownManager);
  }

  // Register temp file cleanup on shutdown
  shutdownManager.registerCleanup('temp-files', () => tempFileService.cleanupAll());

  if (!sessionSecurityConfigured) {
    configureSessionSecurity(__dirname);
    sessionSecurityConfigured = true;
  }

  await createWindow();

  // Set up IPC handlers once (not per-window, as ipcMain.handle registers globally)
  registerIpcHandlers(appContext);
  setupDownloadHandler();

  setupGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

// ShutdownManager handles cleanup on quit
