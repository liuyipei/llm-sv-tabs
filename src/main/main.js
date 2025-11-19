import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let tabManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
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
  tabManager = new TabManager(mainWindow);

  // Set up IPC handlers
  setupIPCHandlers();
}

function setupIPCHandlers() {
  // Tab management
  ipcMain.handle('open-url', async (event, url) => {
    return tabManager.openUrl(url);
  });

  ipcMain.handle('close-tab', async (event, tabId) => {
    return tabManager.closeTab(tabId);
  });

  ipcMain.handle('get-active-tabs', async () => {
    return tabManager.getActiveTabs();
  });

  ipcMain.handle('set-active-tab', async (event, tabId) => {
    return tabManager.setActiveTab(tabId);
  });

  ipcMain.handle('select-tabs', async (event, tabIds) => {
    return tabManager.selectTabs(tabIds);
  });

  // Bookmarks
  ipcMain.handle('get-bookmarks', async () => {
    return []; // Placeholder for bookmark functionality
  });

  ipcMain.handle('add-bookmark', async (event, bookmark) => {
    // Placeholder for bookmark functionality
    return { success: true };
  });

  // LLM Query
  ipcMain.handle('send-query', async (event, query, options) => {
    // Placeholder for LLM query functionality
    return { response: `Echo: ${query}` };
  });
}

app.whenReady().then(() => {
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
