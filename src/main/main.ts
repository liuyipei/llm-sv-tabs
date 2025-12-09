import { app, BrowserWindow, dialog, session, globalShortcut } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { shutdownManager } from './services/shutdown-manager.js';
import { configureSessionSecurity } from './session-security.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';
import type { MainProcessContext } from './ipc/register-ipc-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const appContext: MainProcessContext = {
  tabManager: null,
  bookmarkManager: null,
  screenshotService: null,
};
let sessionSecurityConfigured = false;

function createWindow(): void {
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

  // Initialize tab manager
  appContext.tabManager = new TabManager(mainWindow);

  // Initialize bookmark manager
  appContext.bookmarkManager = new BookmarkManager();

  // Initialize screenshot service
  appContext.screenshotService = new ScreenshotService(mainWindow);

  // Restore session or open default homepage
  const sessionRestored = appContext.tabManager.restoreSession();
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

function setupGlobalShortcuts(): void {
  const getTabManager = () => appContext.tabManager;
  const getScreenshotService = () => appContext.screenshotService;

  const registerShortcuts = () => {
    // Clear any previous registrations before re-registering
    globalShortcut.unregisterAll();

    // Register Cmd+F / Ctrl+F for opening search bar (browser-style find)
    const findShortcut = process.platform === 'darwin' ? 'Command+F' : 'Ctrl+F';
    const findRegistered = globalShortcut.register(findShortcut, () => {
      console.log('Find shortcut triggered:', findShortcut);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        // Focus at all three levels: OS window, UI webContents, then send event
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();

        // Send event to renderer to show/focus search bar
        setTimeout(() => {
          mainWindow.webContents.send('focus-search-bar');
        }, 10);
      }
    });

    if (!findRegistered) {
      console.error('Failed to register find shortcut:', findShortcut);
    } else {
      console.log(`Find shortcut registered: ${findShortcut}`);
    }

    // Register Ctrl+W / Cmd+W for closing the active tab (not the window)
    const closeTabShortcut = process.platform === 'darwin' ? 'Command+W' : 'Ctrl+W';
    const closeTabRegistered = globalShortcut.register(closeTabShortcut, () => {
      console.log('Close tab shortcut triggered:', closeTabShortcut);
      const tabManager = getTabManager();
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.closeTab(activeTabId);
        }
      }
    });

    if (!closeTabRegistered) {
      console.error('Failed to register close tab shortcut:', closeTabShortcut);
    } else {
      console.log(`Close tab shortcut registered: ${closeTabShortcut}`);
    }

    // Register Ctrl+T / Cmd+T for opening a new tab (focus URL bar)
    const newTabShortcut = process.platform === 'darwin' ? 'Command+T' : 'Ctrl+T';
    const newTabRegistered = globalShortcut.register(newTabShortcut, () => {
      console.log('New tab shortcut triggered:', newTabShortcut);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();

        // Focus URL bar for new tab input
        setTimeout(() => {
          mainWindow.webContents.send('focus-url-bar');
        }, 10);
      }
    });

    if (!newTabRegistered) {
      console.error('Failed to register new tab shortcut:', newTabShortcut);
    } else {
      console.log(`New tab shortcut registered: ${newTabShortcut}`);
    }

    // Register Ctrl+R / Cmd+R for reloading the current tab
    const reloadShortcut = process.platform === 'darwin' ? 'Command+R' : 'Ctrl+R';
    const reloadRegistered = globalShortcut.register(reloadShortcut, () => {
      console.log('Reload shortcut triggered:', reloadShortcut);
      const tabManager = getTabManager();
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.reloadTab(activeTabId);
        }
      }
    });

    if (!reloadRegistered) {
      console.error('Failed to register reload shortcut:', reloadShortcut);
    } else {
      console.log(`Reload shortcut registered: ${reloadShortcut}`);
    }

    // Register Cmd+L / Ctrl+L for focusing URL bar (browser-style)
    const focusUrlShortcut = process.platform === 'darwin' ? 'Command+L' : 'Ctrl+L';
    const focusUrlRegistered = globalShortcut.register(focusUrlShortcut, () => {
      console.log('Focus URL bar shortcut triggered:', focusUrlShortcut);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        // Focus at all three levels: OS window, UI webContents, then DOM element
        mainWindow.show();
        mainWindow.focus(); // 1. Focus the OS window
        mainWindow.webContents.focus(); // 2. Focus the UI webContents (not the WebContentsView!)

        // Small defer so focus settles before trying to focus DOM element
        setTimeout(() => {
          mainWindow.webContents.send('focus-url-bar');
        }, 10);
      }
    });

    if (!focusUrlRegistered) {
      console.error('Failed to register focus URL bar shortcut:', focusUrlShortcut);
    } else {
      console.log(`Focus URL bar shortcut registered: ${focusUrlShortcut}`);
    }

    // Register Cmd+. / Ctrl+. for focusing the LLM chat input
    const focusLLMShortcut = process.platform === 'darwin' ? 'Command+.' : 'Ctrl+.';
    const focusLLMRegistered = globalShortcut.register(focusLLMShortcut, () => {
      console.log('Focus LLM input shortcut triggered:', focusLLMShortcut);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();

        setTimeout(() => {
          mainWindow.webContents.send('focus-llm-input');
        }, 10);
      }
    });

    if (!focusLLMRegistered) {
      console.error('Failed to register focus LLM shortcut:', focusLLMShortcut);
    } else {
      console.log(`Focus LLM shortcut registered: ${focusLLMShortcut}`);
    }

    // Register platform-specific screenshot shortcut
    const shortcut = process.platform === 'darwin' ? 'CommandOrControl+Alt+S' : 'Ctrl+Alt+S';

    const registered = globalShortcut.register(shortcut, () => {
      console.log('Screenshot shortcut triggered:', shortcut);
      const screenshotService = getScreenshotService();
      const tabManager = getTabManager();
      if (screenshotService) {
        screenshotService
          .startCapture()
          .then((dataUrl) => {
            if (dataUrl && tabManager) {
              const timestamp = new Date()
                .toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
                .replace(/\//g, '-').replace(',', '');

              const title = `Screenshot ${timestamp}`;
              const noteId = Date.now();

              tabManager.openNoteTab(noteId, title, dataUrl, 'image', true);
            }
          })
          .catch((error) => {
            console.error('Screenshot shortcut error:', error);
          });
      }
    });

    if (!registered) {
      console.error('Failed to register screenshot shortcut:', shortcut);
    } else {
      console.log(`Screenshot shortcut registered: ${shortcut}`);
    }

    // Register navigation shortcuts (back/forward)
    // Mac: Cmd+[, Cmd+], Alt+Left, Alt+Right
    // Windows/Linux: Alt+Left, Alt+Right
    const backShortcuts = process.platform === 'darwin'
      ? ['Command+[', 'Alt+Left']
      : ['Alt+Left'];
    const forwardShortcuts = process.platform === 'darwin'
      ? ['Command+]', 'Alt+Right']
      : ['Alt+Right'];

    for (const backShortcut of backShortcuts) {
      const backRegistered = globalShortcut.register(backShortcut, () => {
        console.log('Back navigation shortcut triggered:', backShortcut);
        const tabManager = getTabManager();
        if (tabManager) {
          const activeTabId = tabManager.getActiveTabs().activeTabId;
          if (activeTabId) {
            tabManager.goBack(activeTabId);
          }
        }
      });

      if (!backRegistered) {
        console.error('Failed to register back shortcut:', backShortcut);
      } else {
        console.log(`Back navigation shortcut registered: ${backShortcut}`);
      }
    }

    for (const forwardShortcut of forwardShortcuts) {
      const forwardRegistered = globalShortcut.register(forwardShortcut, () => {
        console.log('Forward navigation shortcut triggered:', forwardShortcut);
        const tabManager = getTabManager();
        if (tabManager) {
          const activeTabId = tabManager.getActiveTabs().activeTabId;
          if (activeTabId) {
            tabManager.goForward(activeTabId);
          }
        }
      });

      if (!forwardRegistered) {
        console.error('Failed to register forward shortcut:', forwardShortcut);
      } else {
        console.log(`Forward navigation shortcut registered: ${forwardShortcut}`);
      }
    }

    // Register tab switching shortcuts
    // Windows/Linux: Ctrl+Tab, Ctrl+Shift+Tab
    // Mac: Also supports Ctrl+Tab, Ctrl+Shift+Tab (in addition to Cmd+Option+Right/Left)
    const nextTabShortcut = 'Ctrl+Tab';
    const previousTabShortcut = 'Ctrl+Shift+Tab';

    const nextTabRegistered = globalShortcut.register(nextTabShortcut, () => {
      console.log('Next tab shortcut triggered:', nextTabShortcut);
      const tabManager = getTabManager();
      if (tabManager) {
        tabManager.nextTab();
      }
    });

    if (!nextTabRegistered) {
      console.error('Failed to register next tab shortcut:', nextTabShortcut);
    } else {
      console.log(`Next tab shortcut registered: ${nextTabShortcut}`);
    }

    const previousTabRegistered = globalShortcut.register(previousTabShortcut, () => {
      console.log('Previous tab shortcut triggered:', previousTabShortcut);
      const tabManager = getTabManager();
      if (tabManager) {
        tabManager.previousTab();
      }
    });

    if (!previousTabRegistered) {
      console.error('Failed to register previous tab shortcut:', previousTabShortcut);
    } else {
      console.log(`Previous tab shortcut registered: ${previousTabShortcut}`);
    }

    // On Mac, also register Cmd+Option+Left/Right for tab switching
    if (process.platform === 'darwin') {
      const macNextTab = globalShortcut.register('Command+Alt+Right', () => {
        console.log('Next tab shortcut triggered: Command+Alt+Right');
        const tabManager = getTabManager();
        if (tabManager) {
          tabManager.nextTab();
        }
      });

      const macPreviousTab = globalShortcut.register('Command+Alt+Left', () => {
        console.log('Previous tab shortcut triggered: Command+Alt+Left');
        const tabManager = getTabManager();
        if (tabManager) {
          tabManager.previousTab();
        }
      });

      if (!macNextTab) {
        console.error('Failed to register Command+Alt+Right');
      } else {
        console.log('Tab switching shortcut registered: Command+Alt+Right');
      }

      if (!macPreviousTab) {
        console.error('Failed to register Command+Alt+Left');
      } else {
        console.log('Tab switching shortcut registered: Command+Alt+Left');
      }
    }
  };

  // Register shortcuts only while our windows have focus so we don't steal OS-wide shortcuts
  app.on('browser-window-focus', registerShortcuts);
  app.on('browser-window-blur', () => {
    globalShortcut.unregisterAll();
  });

  // Initial registration when the first window is ready/focused
  registerShortcuts();
}

// Disable client hints that would reveal "Electron" in the Sec-CH-UA header.
// configureSessionSecurity sets a Chrome-like user agent so browsing appears as a real browser.
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

app.whenReady().then(() => {
  // Setup shutdown handlers first to catch early termination
  shutdownManager.setup();

  if (!sessionSecurityConfigured) {
    configureSessionSecurity(__dirname);
    sessionSecurityConfigured = true;
  }

  createWindow();

  // Set up IPC handlers once (not per-window, as ipcMain.handle registers globally)
  registerIpcHandlers(appContext);
  setupDownloadHandler();

  setupGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Unregister global shortcuts on quit (ShutdownManager handles the rest)
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
