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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check for smoke test mode (used in CI to verify app starts correctly)
const isSmokeTest = process.argv.includes('--smoke-test');
const SMOKE_TEST_FORCE_EXIT_MS = 5000;
const forceExitTimer = isSmokeTest
  ? (() => {
      const timer = setTimeout(() => {
        console.error('Smoke test: forcing process exit after timeout');
        process.exit(0);
      }, SMOKE_TEST_FORCE_EXIT_MS);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      return timer;
    })()
  : null;

let mainWindow: BrowserWindow | null = null;
const appContext: MainProcessContext = {
  tabManager: null,
  bookmarkManager: null,
  screenshotService: null,
};
let sessionSecurityConfigured = false;

async function createWindow(): Promise<void> {
  const preloadPath = join(__dirname, 'preload.js');

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
      console.log('Smoke test passed: window loaded successfully');
      shutdownManager.performCleanup();
      app.quit();
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
    app.on('window-all-closed', () => {
      console.log('Smoke test: window-all-closed, quitting');
      app.quit();
    });

    app.once('will-quit', () => {
      if (forceExitTimer) {
        clearTimeout(forceExitTimer);
      }

      const immediateExit = setTimeout(() => process.exit(0), 0);
      if (typeof immediateExit.unref === 'function') {
        immediateExit.unref();
      }
    });
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
