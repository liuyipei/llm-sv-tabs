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

/**
 * Set up the application menu with keyboard shortcuts.
 * This provides native OS-level handling of accelerators like Ctrl+N.
 */
function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            console.log('[DEBUG MENU] New Window menu item triggered');
            if (windowFactory) {
              console.log('[DEBUG MENU] Calling windowFactory.createWindow()');
              void windowFactory.createWindow();
            } else {
              console.warn('[DEBUG MENU] windowFactory is null!');
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

  // Set up application menu with Ctrl+N shortcut (must be after createWindow so windowFactory exists)
  setupApplicationMenu();

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
