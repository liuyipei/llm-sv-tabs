import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { ProviderFactory } from './providers/provider-factory.js';
import { ContentExtractor } from './services/content-extractor.js';
import { ModelDiscovery } from './providers/model-discovery.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import type { QueryOptions, LLMResponse, Bookmark, ExtractedContent, ProviderType } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let bookmarkManager: BookmarkManager | null = null;

function createWindow(): void {
  const preloadPath = join(__dirname, 'preload.js');
  console.log('Main process __dirname:', __dirname);
  console.log('Preload path:', preloadPath);

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

  // Open DevTools automatically to see errors
  mainWindow.webContents.openDevTools();

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

  // Initialize bookmark manager
  bookmarkManager = new BookmarkManager();

  // Set up IPC handlers
  setupIPCHandlers();

  // Set up download handler
  setupDownloadHandler();

  // Restore session or open default homepage
  const sessionRestored = tabManager.restoreSession();
  if (!sessionRestored) {
    // No saved session, open default homepage
    tabManager.openUrl('https://www.google.com');
  }
}

function setupDownloadHandler(): void {
  // Handle downloads from BrowserViews
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

function setupIPCHandlers(): void {
  // Tab management
  ipcMain.handle('open-url', async (_event, url: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openUrl(url);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('close-tab', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.closeTab(tabId);
  });

  ipcMain.handle('get-active-tabs', async () => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.getActiveTabs();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('set-active-tab', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.setActiveTab(tabId);
  });

  ipcMain.handle('select-tabs', async (_event, tabIds: string[]) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.selectTabs(tabIds);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('reload-tab', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.reloadTab(tabId);
  });

  ipcMain.handle('copy-tab-url', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.copyTabUrl(tabId);
  });

  ipcMain.handle('open-note-tab', async (_event, noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image') => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openNoteTab(noteId, title, content, fileType);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-llm-response-tab', async (_event, query: string, response?: string, error?: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openLLMResponseTab(query, response, error);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-llm-response-tab', async (_event, tabId: string, response: string, metadata?: any) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.updateLLMResponseTab(tabId, response, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-raw-message-viewer', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openRawMessageViewer(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-debug-info-window', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openDebugInfoWindow(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Bookmarks
  ipcMain.handle('get-bookmarks', async () => {
    if (!bookmarkManager) return { success: false, error: 'BookmarkManager not initialized' };
    try {
      const bookmarks = bookmarkManager.getBookmarks();
      return { success: true, data: bookmarks };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('add-bookmark', async (_event, bookmark: Omit<Bookmark, 'id' | 'created'>) => {
    if (!bookmarkManager) return { success: false, error: 'BookmarkManager not initialized' };
    try {
      const newBookmark = bookmarkManager.addBookmark(bookmark);
      return { success: true, data: newBookmark };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-bookmark', async (_event, id: string) => {
    if (!bookmarkManager) return { success: false, error: 'BookmarkManager not initialized' };
    try {
      const success = bookmarkManager.deleteBookmark(id);
      return { success, data: { id } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // LLM Query
  ipcMain.handle('send-query', async (_event, query: string, options?: QueryOptions): Promise<LLMResponse> => {
    if (!options?.provider) {
      return {
        response: '',
        error: 'Provider is required',
      };
    }

    try {
      // Get provider instance
      const provider = ProviderFactory.getProvider(
        options.provider,
        options.apiKey,
        options.endpoint
      );

      // Build messages array
      const messages: Array<{ role: string; content: string }> = [];

      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      // Extract content from selected tabs if requested
      let contextContent = '';
      if (tabManager && options.selectedTabIds && options.selectedTabIds.length > 0) {
        const extractedContents: ExtractedContent[] = [];

        for (const tabId of options.selectedTabIds) {
          const view = tabManager.getTabView(tabId);
          if (view) {
            try {
              const content = await ContentExtractor.extractFromTab(
                view,
                tabId,
                options.includeMedia ?? false
              );
              extractedContents.push(content);
            } catch (error) {
              console.error(`Failed to extract content from tab ${tabId}:`, error);
            }
          }
        }

        // Format extracted content for LLM
        if (extractedContents.length > 0) {
          contextContent = extractedContents
            .map((content) => {
              const dom = content.content as any;
              return `
Tab: ${content.title}
URL: ${content.url}

${dom.mainContent || ''}
              `.trim();
            })
            .join('\n\n---\n\n');

          contextContent = `Here is the content from the selected tabs:\n\n${contextContent}\n\n`;
        }
      }

      // Add user query with context
      const fullQuery = contextContent ? `${contextContent}${query}` : query;
      messages.push({ role: 'user', content: fullQuery });

      // Send query to provider
      const response = await provider.query(messages, options);

      // Add fullQuery to response metadata
      return {
        ...response,
        fullQuery: fullQuery !== query ? fullQuery : undefined,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Content extraction
  ipcMain.handle('extract-content', async (_event, tabId: string, includeScreenshot = false) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };

    try {
      const view = tabManager.getTabView(tabId);
      if (!view) {
        return { success: false, error: 'Tab not found' };
      }

      const content = await ContentExtractor.extractFromTab(view, tabId, includeScreenshot);
      return { success: true, data: content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Model discovery
  ipcMain.handle('discover-models', async (_event, provider: ProviderType, apiKey?: string, endpoint?: string) => {
    try {
      const models = await ModelDiscovery.discoverModels(provider, apiKey, endpoint);
      return { success: true, data: models };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
