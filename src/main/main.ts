import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { ProviderFactory } from './providers/provider-factory.js';
import { ContentExtractor } from './services/content-extractor.js';
import type { QueryOptions, LLMResponse, Bookmark, ExtractedContent } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;

function createWindow(): void {
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

  // Bookmarks
  ipcMain.handle('get-bookmarks', async () => {
    // Placeholder for bookmark functionality
    const bookmarks: Bookmark[] = [];
    return { success: true, data: bookmarks };
  });

  ipcMain.handle('add-bookmark', async (_event, bookmark: Omit<Bookmark, 'id' | 'created'>) => {
    // Placeholder for bookmark functionality
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}`,
      created: Date.now(),
    };
    return { success: true, data: newBookmark };
  });

  ipcMain.handle('delete-bookmark', async (_event, id: string) => {
    // Placeholder for bookmark functionality
    return { success: true, data: { id } };
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

      return response;
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
