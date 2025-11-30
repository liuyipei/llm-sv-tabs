import { app, BrowserWindow, ipcMain, dialog, session, globalShortcut } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { ProviderFactory } from './providers/provider-factory.js';
import { ContentExtractor } from './services/content-extractor.js';
import { ModelDiscovery } from './providers/model-discovery.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import { ScreenshotService } from './services/screenshot-service.js';
import type { QueryOptions, LLMResponse, Bookmark, ExtractedContent, ProviderType, ContentBlock, MessageContent } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let bookmarkManager: BookmarkManager | null = null;
let screenshotService: ScreenshotService | null = null;

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

  // Initialize screenshot service
  screenshotService = new ScreenshotService(mainWindow);

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

function setupIPCHandlers(): void {
  // Tab management
  ipcMain.handle('open-url', async (_event, url: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      // Handle special URL schemes
      if (url.startsWith('api-keys://')) {
        const result = tabManager.openApiKeyInstructionsTab();
        return { success: true, data: result };
      }

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

  ipcMain.handle('update-tab-title', async (_event, tabId: string, title: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.updateTabTitle(tabId, title);
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

  // LLM Query with Streaming
  ipcMain.handle('send-query', async (_event, query: string, options?: QueryOptions): Promise<LLMResponse> => {
    if (!options?.provider) {
      return {
        response: '',
        error: 'Provider is required',
      };
    }

    if (!tabManager) {
      return {
        response: '',
        error: 'TabManager not initialized',
      };
    }

    // Use existing tab ID if provided, otherwise create a new LLM response tab
    const tabId = options.tabId || tabManager.openLLMResponseTab(query).tabId;

    try {
      // Get provider instance
      const provider = ProviderFactory.getProvider(
        options.provider,
        options.apiKey,
        options.endpoint
      );

      // Build messages array (supporting multimodal content)
      const messages: Array<{ role: string; content: MessageContent }> = [];

      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      // Extract content from selected tabs if requested
      const extractedContents: ExtractedContent[] = [];
      if (options.selectedTabIds && options.selectedTabIds.length > 0) {
        for (const selectedTabId of options.selectedTabIds) {
          const tab = tabManager.getTab(selectedTabId);
          if (!tab) continue;

          try {
            // Check if this is a note tab (could be image, text, or LLM response)
            if (tab.type === 'notes' || tab.component === 'llm-response') {
              const tabData = tabManager.getTabData(selectedTabId);
              if (tabData) {
                const content = await ContentExtractor.extractFromNoteTab(tabData);
                extractedContents.push(content);
              }
            } else {
              // Regular webpage tab with WebContentsView
              const view = tabManager.getTabView(selectedTabId);
              if (view) {
                const content = await ContentExtractor.extractFromTab(
                  view,
                  selectedTabId,
                  options.includeMedia ?? false
                );
                extractedContents.push(content);
              }
            }
          } catch (error) {
            console.error(`Failed to extract content from tab ${selectedTabId}:`, error);
          }
        }
      }

      // Check if we have any images
      const hasImages = extractedContents.some(c => c.type === 'image' || c.imageData);

      // Build user message content
      let userMessageContent: MessageContent;
      let fullQuery = query;

      if (hasImages) {
        // Build multimodal content array
        const contentBlocks: ContentBlock[] = [];

        // Add text context from tabs first
        const textContents = extractedContents
          .filter(c => c.type !== 'image')
          .map((content) => {
            const dom = content.content as any;
            return `
Tab: ${content.title}
URL: ${content.url}

${dom.mainContent || content.content || ''}
            `.trim();
          })
          .filter(text => text.length > 0);

        if (textContents.length > 0) {
          const contextText = `Here is the content from the selected tabs:\n\n${textContents.join('\n\n---\n\n')}\n\n`;
          fullQuery = `${contextText}${query}`;
        }

        // Add text block with query
        contentBlocks.push({
          type: 'text',
          text: fullQuery,
        });

        // Add image blocks
        for (const content of extractedContents) {
          if (content.imageData) {
            // Parse data URL to get base64 data without prefix
            const dataUrlMatch = content.imageData.data.match(/^data:([^;]+);base64,(.+)$/);
            const base64Data = dataUrlMatch ? dataUrlMatch[2] : content.imageData.data;
            const mimeType = dataUrlMatch ? dataUrlMatch[1] : content.imageData.mimeType;

            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data,
              },
            });
          }
        }

        userMessageContent = contentBlocks;
      } else {
        // Text-only content
        const textContents = extractedContents
          .map((content) => {
            const dom = content.content as any;
            return `
Tab: ${content.title}
URL: ${content.url}

${dom.mainContent || content.content || ''}
            `.trim();
          })
          .filter(text => text.length > 0);

        if (textContents.length > 0) {
          const contextText = `Here is the content from the selected tabs:\n\n${textContents.join('\n\n---\n\n')}\n\n`;
          fullQuery = `${contextText}${query}`;
        }

        userMessageContent = fullQuery;
      }

      // Add user message
      messages.push({ role: 'user', content: userMessageContent });

      // Stream response
      const response = await provider.queryStream(messages, options, (chunk) => {
        // Send chunk to renderer
        tabManager!.sendStreamChunk(tabId, chunk);
      });

      // Update tab metadata after streaming completes
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.response = response.response;
        tab.metadata.isStreaming = false;
        tab.metadata.tokensIn = response.tokensIn;
        tab.metadata.tokensOut = response.tokensOut;
        tab.metadata.model = response.model;
        tab.metadata.fullQuery = typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined;

        // Update title
        const modelName = response.model || '';
        const tokensIn = response.tokensIn || 0;
        const tokensOut = response.tokensOut || 0;

        if (modelName && tokensIn > 0 && tokensOut > 0) {
          tab.title = `Response ${modelName} up: ${tokensIn.toLocaleString()} down: ${tokensOut.toLocaleString()}`;
        } else if (modelName) {
          tab.title = `Response ${modelName}`;
        }

        tabManager.updateLLMResponseTab(tabId, response.response, {
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          model: response.model,
          error: response.error,
        });
      }

      // Add fullQuery to response metadata (only for text queries)
      return {
        ...response,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      };
    } catch (error) {
      // Update tab with error
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.error = error instanceof Error ? error.message : String(error);
        tab.metadata.isStreaming = false;
      }

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

  // Screenshot capture
  ipcMain.handle('trigger-screenshot', async () => {
    if (!screenshotService || !tabManager) {
      console.error('Screenshot service or tab manager not initialized');
      return { success: false, error: 'Screenshot service not initialized' };
    }

    try {
      console.log('Main: Starting screenshot capture...');
      const dataUrl = await screenshotService.startCapture();

      if (!dataUrl) {
        console.log('Main: Screenshot was cancelled by user');
        return { success: false, error: 'Screenshot cancelled' };
      }

      console.log('Main: Screenshot captured successfully, creating tab...');

      // Create a new image tab with the screenshot
      const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\//g, '-').replace(',', '');

      const title = `Screenshot ${timestamp}`;
      const noteId = Date.now();

      tabManager.openNoteTab(noteId, title, dataUrl, 'image', true);

      console.log('Main: Screenshot tab created successfully');
      return { success: true };
    } catch (error) {
      console.error('Screenshot error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function setupGlobalShortcuts(): void {
  // Register platform-specific screenshot shortcut
  const shortcut = process.platform === 'darwin' ? 'CommandOrControl+Alt+S' : 'Ctrl+Alt+S';

  const registered = globalShortcut.register(shortcut, () => {
    console.log('Screenshot shortcut triggered:', shortcut);
    if (screenshotService) {
      screenshotService.startCapture().then((dataUrl) => {
        if (dataUrl && tabManager) {
          const timestamp = new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).replace(/\//g, '-').replace(',', '');

          const title = `Screenshot ${timestamp}`;
          const noteId = Date.now();

          tabManager.openNoteTab(noteId, title, dataUrl, 'image', true);
        }
      }).catch((error) => {
        console.error('Screenshot shortcut error:', error);
      });
    }
  });

  if (!registered) {
    console.error('Failed to register screenshot shortcut:', shortcut);
  } else {
    console.log(`Screenshot shortcut registered: ${shortcut}`);
  }
}

app.whenReady().then(() => {
  createWindow();
  setupGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
