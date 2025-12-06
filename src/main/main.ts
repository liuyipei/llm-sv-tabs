import { app, BrowserWindow, ipcMain, dialog, session, Menu } from 'electron';
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

function createWindow(): void {
  const preloadPath = join(__dirname, 'preload.js');
  console.log('Main process __dirname:', __dirname);
  console.log('Preload path:', preloadPath);

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

/**
 * Set up keyboard shortcuts using before-input-event on mainWindow.webContents
 * This is called after mainWindow is created to ensure webContents is available.
 *
 * We use before-input-event instead of Menu accelerators because:
 * - Menu accelerators have a bug on Windows where they fire without modifier keys
 * - before-input-event gives us full control over when shortcuts fire
 * - We can properly check modifier keys before triggering actions
 */
function setupKeyboardShortcuts(): void {
  if (!mainWindow) return;

  const isMac = process.platform === 'darwin';

  // Helper to send IPC to renderer
  const sendToRenderer = (channel: string): void => {
    if (mainWindow) {
      mainWindow.webContents.send(channel);
    }
  };

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const ctrlOrCmd = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();

    // Only process if a modifier key is pressed (Ctrl/Cmd or Alt)
    if (!ctrlOrCmd && !input.alt) return;

    // Ctrl/Cmd + T - New Tab (focus URL bar)
    if (ctrlOrCmd && key === 't' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+T (New Tab)');
      sendToRenderer('focus-url-bar');
      return;
    }

    // Ctrl/Cmd + W - Close Tab
    if (ctrlOrCmd && key === 'w' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+W (Close Tab)');
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.closeTab(activeTabId);
        }
      }
      return;
    }

    // Ctrl/Cmd + L - Focus URL Bar
    if (ctrlOrCmd && key === 'l' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+L (Focus URL Bar)');
      sendToRenderer('focus-url-bar');
      return;
    }

    // Ctrl/Cmd + F - Find in Page
    if (ctrlOrCmd && key === 'f' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+F (Find)');
      sendToRenderer('focus-search-bar');
      return;
    }

    // Ctrl/Cmd + R - Reload
    if (ctrlOrCmd && key === 'r' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+R (Reload)');
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.reloadTab(activeTabId);
        }
      }
      return;
    }

    // Ctrl/Cmd + . - Focus LLM Input
    if (ctrlOrCmd && key === '.' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+. (Focus LLM Input)');
      sendToRenderer('focus-llm-input');
      return;
    }

    // Ctrl/Cmd + D - Bookmark
    if (ctrlOrCmd && key === 'd' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+D (Bookmark)');
      sendToRenderer('bookmark-tab');
      return;
    }

    // Ctrl/Cmd + Alt + S - Screenshot
    if (ctrlOrCmd && input.alt && key === 's' && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+Alt+S (Screenshot)');
      if (screenshotService && tabManager) {
        screenshotService.startCapture().then((dataUrl) => {
          if (dataUrl) {
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
            tabManager!.openNoteTab(noteId, title, dataUrl, 'image', true);
          }
        }).catch(console.error);
      }
      return;
    }

    // Alt + Left - Go Back (Windows/Linux)
    if (!isMac && input.alt && key === 'arrowleft' && !ctrlOrCmd && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Alt+Left (Back)');
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.goBack(activeTabId);
        }
      }
      return;
    }

    // Alt + Right - Go Forward (Windows/Linux)
    if (!isMac && input.alt && key === 'arrowright' && !ctrlOrCmd && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Alt+Right (Forward)');
      if (tabManager) {
        const activeTabId = tabManager.getActiveTabs().activeTabId;
        if (activeTabId) {
          tabManager.goForward(activeTabId);
        }
      }
      return;
    }

    // Ctrl + Tab - Next Tab
    if (input.control && key === 'tab' && !input.alt && !input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+Tab (Next Tab)');
      if (tabManager) {
        tabManager.nextTab();
      }
      return;
    }

    // Ctrl + Shift + Tab - Previous Tab
    if (input.control && key === 'tab' && !input.alt && input.shift) {
      event.preventDefault();
      console.log('Shortcut: Ctrl+Shift+Tab (Previous Tab)');
      if (tabManager) {
        tabManager.previousTab();
      }
      return;
    }
  });

  console.log('Keyboard shortcuts initialized via before-input-event');
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  // Build menu template - accelerators shown for reference only (registerAccelerator: false)
  // Actual shortcuts are handled by before-input-event in setupKeyboardShortcuts()
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
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
    }] : []),

    // File menu - Tab operations
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrControl+T',
          registerAccelerator: false, // Handled by before-input-event
          click: (): void => {
            if (mainWindow) mainWindow.webContents.send('focus-url-bar');
          },
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrControl+W',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) {
              const activeTabId = tabManager.getActiveTabs().activeTabId;
              if (activeTabId) tabManager.closeTab(activeTabId);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Take Screenshot',
          accelerator: 'CmdOrControl+Alt+S',
          registerAccelerator: false,
          click: (): void => {
            // Handled by before-input-event
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    // Edit menu - Standard edit operations (keep default accelerators for copy/paste)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrControl+F',
          registerAccelerator: false,
          click: (): void => {
            if (mainWindow) mainWindow.webContents.send('focus-search-bar');
          },
        },
      ],
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrControl+R',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) {
              const activeTabId = tabManager.getActiveTabs().activeTabId;
              if (activeTabId) tabManager.reloadTab(activeTabId);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Focus URL Bar',
          accelerator: 'CmdOrControl+L',
          registerAccelerator: false,
          click: (): void => {
            if (mainWindow) mainWindow.webContents.send('focus-url-bar');
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const },
      ],
    },

    // Navigation menu
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Back',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) {
              const activeTabId = tabManager.getActiveTabs().activeTabId;
              if (activeTabId) tabManager.goBack(activeTabId);
            }
          },
        },
        {
          label: 'Forward',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) {
              const activeTabId = tabManager.getActiveTabs().activeTabId;
              if (activeTabId) tabManager.goForward(activeTabId);
            }
          },
        },
      ],
    },

    // Tab menu
    {
      label: 'Tab',
      submenu: [
        {
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) tabManager.nextTab();
          },
        },
        {
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          registerAccelerator: false,
          click: (): void => {
            if (tabManager) tabManager.previousTab();
          },
        },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  console.log('Application menu initialized (shortcuts handled by before-input-event)');
}

// Disable client hints that would reveal "Electron" in the Sec-CH-UA header.
// See CHROME_USER_AGENT comment above for rationale - this is a real browser for humans.
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

app.whenReady().then(() => {
  createWindow();

  // Set up IPC handlers once (not per-window, as ipcMain.handle registers globally)
  setupIPCHandlers();
  setupDownloadHandler();

  // Set up keyboard shortcuts via before-input-event (more reliable than Menu accelerators)
  setupKeyboardShortcuts();

  // Set up application menu (accelerators shown for reference but not registered)
  setupApplicationMenu();

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
