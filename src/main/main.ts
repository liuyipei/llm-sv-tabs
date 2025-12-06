import { app, BrowserWindow, ipcMain, dialog, session, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import TabManager from './tab-manager.js';
import { ProviderFactory } from './providers/provider-factory.js';
import { ContentExtractor } from './services/content-extractor.js';
import { ModelDiscovery } from './providers/model-discovery.js';
import { BookmarkManager } from './services/bookmark-manager.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { normalizeWhitespace } from './utils/text-normalizer.js';
import { formatSerializedDOM } from './utils/dom-formatter.js';
import type { QueryOptions, LLMResponse, Bookmark, ExtractedContent, ProviderType, ContentBlock, MessageContent, SerializedDOM } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Chrome-like User-Agent to present ourselves as a standard browser.
//
// This is a legitimate browser for real human users, not a bot or scraper.
// Electron's default User-Agent includes "Electron" which causes sites like Google
// to trigger CAPTCHA challenges, even for normal human browsing. Since we're using
// the same Chromium rendering engine as Chrome, presenting as Chrome is accurate
// and allows our users to browse without unnecessary friction.
const CHROME_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let bookmarkManager: BookmarkManager | null = null;
let screenshotService: ScreenshotService | null = null;
let sessionHandlersConfigured = false;

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0] ?? null;
}

function focusMainUI(): BrowserWindow | null {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) return null;

  window.show();
  window.focus();
  window.webContents.focus();
  return window;
}

function setupSessionHandlers(): void {
  if (sessionHandlersConfigured) return;
  sessionHandlersConfigured = true;

  // Set up Content Security Policy before creating window
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Get the dev server URL from environment or construct production file URL
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    // Use pathToFileURL to properly convert file path to URL (handles Windows backslashes)
    const prodFileUrl = pathToFileURL(join(__dirname, '../../dist/index.html')).href;

    // Check if this is the main app window (not a browsing tab)
    const isMainWindow = details.url === devServerUrl ||
                         details.url === prodFileUrl ||
                         (devServerUrl && details.url.startsWith(devServerUrl));

    if (isMainWindow) {
      // Build dynamic connect-src based on environment
      let connectSrc = "'self'";
      if (devServerUrl) {
        try {
          const devUrl = new URL(devServerUrl);
          // Allow both HTTP and WebSocket connections to the dev server
          connectSrc = `'self' ${devServerUrl} ws://${devUrl.host}`;
        } catch {
          // If URL parsing fails, fall back to self only
          connectSrc = "'self'";
        }
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "media-src 'self' data: blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; ')
          ]
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // Set Chrome-like User-Agent on the default session
  // This affects all WebContentsViews that use the default session
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);

  // Sanitize outgoing request headers to remove any Electron identifiers
  // This is a fallback in case any headers still contain "Electron"
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };

    // Ensure User-Agent doesn't contain Electron (belt and suspenders)
    if (headers['User-Agent']?.includes('Electron')) {
      headers['User-Agent'] = CHROME_USER_AGENT;
    }

    // Remove or sanitize any Sec-CH-UA headers that might contain Electron
    // (though disabling UserAgentClientHint should prevent these)
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().startsWith('sec-ch-ua') && headers[key]?.includes('Electron')) {
        delete headers[key];
      }
    }

    callback({ requestHeaders: headers });
  });
}

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
  if (!bookmarkManager) {
    bookmarkManager = new BookmarkManager();
  }

  // Initialize screenshot service
  if (!screenshotService) {
    screenshotService = new ScreenshotService(mainWindow);
  }

  // Restore session or open default homepage
  const sessionRestored = tabManager.restoreSession();
  if (!sessionRestored) {
    // No saved session, open default homepage
    tabManager.openUrl('https://www.google.com');
  }

  mainWindow.on('closed', () => {
    tabManager?.dispose();
    tabManager = null;
    mainWindow = null;

    // Clear per-window services to avoid leaked listeners on re-create
    screenshotService?.dispose();
    screenshotService = null;
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

  ipcMain.handle('go-back', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.goBack(tabId);
  });

  ipcMain.handle('go-forward', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.goForward(tabId);
  });

  ipcMain.handle('get-navigation-state', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.getNavigationState(tabId);
  });

  ipcMain.handle('next-tab', async () => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.nextTab();
  });

  ipcMain.handle('previous-tab', async () => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.previousTab();
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
            let formattedContent = '';

            // Check if content is SerializedDOM (structured HTML data)
            if (content.type === 'html' && typeof content.content === 'object' && 'mainContent' in content.content) {
              formattedContent = formatSerializedDOM(content.content as SerializedDOM);
            } else if (typeof content.content === 'string') {
              // Plain text content
              formattedContent = normalizeWhitespace(content.content);
            } else {
              // Fallback for other types
              formattedContent = normalizeWhitespace(String(content.content));
            }

            return `
# Tab: ${content.title}
**URL**: ${content.url}

${formattedContent}
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
            let formattedContent = '';

            // Check if content is SerializedDOM (structured HTML data)
            if (content.type === 'html' && typeof content.content === 'object' && 'mainContent' in content.content) {
              formattedContent = formatSerializedDOM(content.content as SerializedDOM);
            } else if (typeof content.content === 'string') {
              // Plain text content
              formattedContent = normalizeWhitespace(content.content);
            } else {
              // Fallback for other types
              formattedContent = normalizeWhitespace(String(content.content));
            }

            return `
# Tab: ${content.title}
**URL**: ${content.url}

${formattedContent}
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

  // Find in page
  ipcMain.handle('find-in-page', async (_event, tabId: string, text: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findInPage(tabId, text);
  });

  ipcMain.handle('find-next', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findNext(tabId);
  });

  ipcMain.handle('find-previous', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findPrevious(tabId);
  });

  ipcMain.handle('stop-find-in-page', async (_event, tabId: string) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.stopFindInPage(tabId);
  });

  ipcMain.handle('set-search-bar-visible', async (_event, visible: boolean) => {
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    tabManager.setSearchBarVisible(visible);
    return { success: true };
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

function createApplicationMenu(): void {
  const focusUrlShortcut = 'CommandOrControl+L';
  const newTabShortcut = 'CommandOrControl+T';
  const closeTabShortcut = 'CommandOrControl+W';
  const reloadShortcut = 'CommandOrControl+R';
  const findShortcut = 'CommandOrControl+F';
  const screenshotShortcut = 'CommandOrControl+Alt+S';
  const focusLLMInputShortcut = 'CommandOrControl+.';

  const navigationShortcuts = {
    back: process.platform === 'darwin' ? ['Command+[', 'Alt+Left'] : ['Alt+Left'],
    forward: process.platform === 'darwin' ? ['Command+]', 'Alt+Right'] : ['Alt+Right'],
    nextTab: ['Ctrl+Tab', ...(process.platform === 'darwin' ? ['Command+Alt+Right'] : [])],
    previousTab: ['Ctrl+Shift+Tab', ...(process.platform === 'darwin' ? ['Command+Alt+Left'] : [])],
  };

  const focusUrlBar = (): void => {
    const window = focusMainUI();
    if (!window) return;

    setTimeout(() => {
      window.webContents.send('focus-url-bar');
    }, 10);
  };

  const focusSearchBar = (): void => {
    const window = focusMainUI();
    if (!window) return;

    setTimeout(() => {
      window.webContents.send('focus-search-bar');
    }, 10);
  };

  const focusLLMInput = (): void => {
    const window = focusMainUI();
    if (!window) return;

    setTimeout(() => {
      window.webContents.send('focus-llm-input');
    }, 10);
  };

  const closeActiveTab = (): void => {
    if (!tabManager) return;
    const activeTabId = tabManager.getActiveTabs().activeTabId;
    if (activeTabId) {
      tabManager.closeTab(activeTabId);
    }
  };

  const openNewTab = (): void => {
    const window = focusMainUI();
    if (!window || !tabManager) return;

    const { tabId } = tabManager.openUrl('https://www.google.com');
    tabManager.setActiveTab(tabId);

    setTimeout(() => {
      window.webContents.send('focus-url-bar');
    }, 10);
  };

  const reloadActiveTab = (): void => {
    if (!tabManager) return;
    const activeTabId = tabManager.getActiveTabs().activeTabId;
    if (activeTabId) {
      tabManager.reloadTab(activeTabId);
    }
  };

  const captureScreenshot = (): void => {
    if (!screenshotService) return;

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
      console.error('Screenshot capture failed:', error);
    });
  };

  const goBack = (): void => {
    if (!tabManager) return;
    const activeTabId = tabManager.getActiveTabs().activeTabId;
    if (activeTabId) {
      tabManager.goBack(activeTabId);
    }
  };

  const goForward = (): void => {
    if (!tabManager) return;
    const activeTabId = tabManager.getActiveTabs().activeTabId;
    if (activeTabId) {
      tabManager.goForward(activeTabId);
    }
  };

  const nextTab = (): void => {
    if (tabManager) {
      tabManager.nextTab();
    }
  };

  const previousTab = (): void => {
    if (tabManager) {
      tabManager.previousTab();
    }
  };

  const navigationItems: MenuItemConstructorOptions[] = [
    ...navigationShortcuts.back.map((accelerator) => ({ label: `Back (${accelerator})`, accelerator, click: goBack })),
    ...navigationShortcuts.forward.map((accelerator) => ({ label: `Forward (${accelerator})`, accelerator, click: goForward })),
    { type: 'separator' as const },
    ...navigationShortcuts.nextTab.map((accelerator) => ({ label: `Next Tab (${accelerator})`, accelerator, click: nextTab })),
    ...navigationShortcuts.previousTab.map((accelerator) => ({ label: `Previous Tab (${accelerator})`, accelerator, click: previousTab })),
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: newTabShortcut, click: openNewTab },
        { label: 'Close Tab', accelerator: closeTabShortcut, click: closeActiveTab },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload Tab', accelerator: reloadShortcut, click: reloadActiveTab },
        { label: 'Focus Address Bar', accelerator: focusUrlShortcut, click: focusUrlBar },
        { label: 'Focus LLM Input', accelerator: focusLLMInputShortcut, click: focusLLMInput },
        { label: 'Find in Page', accelerator: findShortcut, click: focusSearchBar },
        { label: 'Screenshot', accelerator: screenshotShortcut, click: captureScreenshot },
      ],
    },
    {
      label: 'Navigate',
      submenu: navigationItems,
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Disable client hints that would reveal "Electron" in the Sec-CH-UA header.
// See CHROME_USER_AGENT comment above for rationale - this is a real browser for humans.
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

app.whenReady().then(() => {
  setupSessionHandlers();
  createWindow();

  // Set up IPC handlers once (not per-window, as ipcMain.handle registers globally)
  setupIPCHandlers();
  setupDownloadHandler();

  createApplicationMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  screenshotService?.dispose();
  screenshotService = null;

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
