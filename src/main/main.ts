import { app, BrowserWindow, dialog, session, Menu } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { shutdownManager } from './services/shutdown-manager.js';
import { tempFileService } from './services/temp-file-service.js';
import { WindowFactory } from './services/window-factory.js';
import { configureSessionSecurity } from './session-security.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';
import type { MainProcessContext } from './ipc/register-ipc-handlers.js';
import { initSmokeTestExit } from './smoke-test-exit.js';
import type { SmokeTestExitControls } from './smoke-test-exit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check for smoke test mode (used in CI to verify app starts correctly)
const isSmokeTest = process.argv.includes('--smoke-test');

let mainWindow: BrowserWindow | null = null;
let windowFactory: WindowFactory | null = null;
const appContext: MainProcessContext = {
  tabManager: null,
  bookmarkManager: null,
  screenshotService: null,
  createNewWindow: null,
};
let sessionSecurityConfigured = false;
let smokeTestExit: SmokeTestExitControls | null = null;

async function createWindow(): Promise<void> {
  const preloadPath = join(__dirname, 'preload.js');
  const distPath = join(__dirname, '../../dist');

  // Create the window factory (used for creating additional windows)
  windowFactory = new WindowFactory(
    {
      preloadPath,
      distPath,
      devServerUrl: process.env.VITE_DEV_SERVER_URL,
    },
    {
      getTabManager: () => appContext.tabManager!,
    }
  );

  // Create the primary window using the factory
  mainWindow = windowFactory.createPrimaryWindow();

  // In smoke test mode, exit after window loads successfully
  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      smokeTestExit?.handleWindowLoaded();
    });
  }

  // Initialize tab manager with the primary window
  appContext.tabManager = new TabManager(mainWindow);

  // Set up callbacks on TabManager for window creation (context menu, shift+click, Ctrl+N)
  // This must happen BEFORE restoring session so that restored tabs have the context menu options
  windowFactory.setupTabManagerCallbacks();

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

  // Set up the createNewWindow function for IPC handlers
  appContext.createNewWindow = (url?: string) => windowFactory!.createWindow(url);
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
 * Keyboard Shortcut Architecture: Application Menu Null
 * ======================================================
 *
 * We disable Electron's default menu via Menu.setApplicationMenu(null).
 * This gives us full control over keyboard shortcuts without interference
 * from Electron's menu accelerators.
 *
 * WHY NOT use Electron's menu accelerators?
 * - Menu accelerators don't work reliably when focus is inside a webContents
 * - On Windows, Ctrl+N wouldn't trigger when the Svelte UI has focus
 * - We want unified shortcut handling across the entire app
 *
 * WHY NOT use globalShortcut?
 * - Intercepts keys system-wide, even when app is not focused
 * - Can interfere with other applications
 * - Anti-pattern for desktop apps
 *
 * OUR APPROACH: Two-layer shortcut handling
 *
 * Layer 1: Renderer (src/ui/utils/keyboard-shortcuts.ts)
 * - Handles shortcuts when the Svelte UI has focus (sidebar, URL bar, etc.)
 * - Uses window.addEventListener('keydown', ...)
 * - Defined in src/shared/keyboard-shortcuts.ts
 *
 * Layer 2: WebContentsView (src/main/tab-manager.ts setupViewKeyboardShortcuts)
 * - Handles shortcuts when browser content has focus
 * - Uses webContents.on('before-input-event', ...)
 * - Same definitions from src/shared/keyboard-shortcuts.ts
 *
 * Both layers use the same shortcut definitions for consistency.
 * See src/shared/keyboard-shortcuts.ts for the full list.
 */
function disableDefaultMenu(): void {
  // Disable Electron's default menu to prevent it from consuming keyboard
  // shortcuts. All shortcuts are handled by our renderer and WebContentsView
  // handlers instead.
  Menu.setApplicationMenu(null);
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

  // Disable Electron's default menu - we handle all shortcuts ourselves
  // See disableDefaultMenu() for the full architecture explanation
  disableDefaultMenu();

  // Set up IPC handlers once (not per-window, as ipcMain.handle registers globally)
  registerIpcHandlers(appContext);
  setupDownloadHandler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

// ShutdownManager handles cleanup on quit
