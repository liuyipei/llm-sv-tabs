import { ipcMain } from 'electron';
import TabManager from '../tab-manager.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import { ContentExtractor } from '../services/content-extractor.js';
import { ModelDiscovery } from '../providers/model-discovery.js';
import { BookmarkManager } from '../services/bookmark-manager.js';
import { ScreenshotService } from '../services/screenshot-service.js';
import { normalizeWhitespace } from '../utils/text-normalizer.js';
import { formatSerializedDOM } from '../utils/dom-formatter.js';
import type {
  QueryOptions,
  LLMResponse,
  Bookmark,
  ExtractedContent,
  ProviderType,
  ContentBlock,
  MessageContent,
  SerializedDOM,
  ContextTabInfo,
} from '../../types';

export interface MainProcessContext {
  tabManager: TabManager | null;
  bookmarkManager: BookmarkManager | null;
  screenshotService: ScreenshotService | null;
}

export function registerIpcHandlers(context: MainProcessContext): void {

  // Tab management
  ipcMain.handle('open-url', async (_event, url: string) => {
    const tabManager = context.tabManager;
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
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.closeTab(tabId);
  });

  ipcMain.handle('get-active-tabs', async () => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.getActiveTabs();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('set-active-tab', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.setActiveTab(tabId);
  });

  ipcMain.handle('focus-active-web-contents', async () => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.focusActiveWebContents();
  });

  ipcMain.handle('select-tabs', async (_event, tabIds: string[]) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.selectTabs(tabIds);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('reload-tab', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.reloadTab(tabId);
  });

  ipcMain.handle('go-back', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.goBack(tabId);
  });

  ipcMain.handle('go-forward', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.goForward(tabId);
  });

  ipcMain.handle('get-navigation-state', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.getNavigationState(tabId);
  });

  ipcMain.handle('next-tab', async () => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.nextTab();
  });

  ipcMain.handle('previous-tab', async () => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.previousTab();
  });

  ipcMain.handle('update-tab-title', async (_event, tabId: string, title: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.updateTabTitle(tabId, title);
  });

  ipcMain.handle('copy-tab-url', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.copyTabUrl(tabId);
  });

  ipcMain.handle('open-note-tab', async (_event, noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image') => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openNoteTab(noteId, title, content, fileType);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-llm-response-tab', async (_event, query: string, response?: string, error?: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openLLMResponseTab(query, response, error);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-llm-response-tab', async (_event, tabId: string, response: string, metadata?: any) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.updateLLMResponseTab(tabId, response, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-llm-metadata', async (_event, tabId: string, metadata: any) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.updateLLMMetadata(tabId, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-raw-message-viewer', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    try {
      const result = tabManager.openRawMessageViewer(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-debug-info-window', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
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
    const bookmarkManager = context.bookmarkManager;
    if (!bookmarkManager) return { success: false, error: 'BookmarkManager not initialized' };
    try {
      const bookmarks = bookmarkManager.getBookmarks();
      return { success: true, data: bookmarks };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('add-bookmark', async (_event, bookmark: Omit<Bookmark, 'id' | 'created'>) => {
    const bookmarkManager = context.bookmarkManager;
    if (!bookmarkManager) return { success: false, error: 'BookmarkManager not initialized' };
    try {
      const newBookmark = bookmarkManager.addBookmark(bookmark);
      return { success: true, data: newBookmark };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-bookmark', async (_event, id: string) => {
    const bookmarkManager = context.bookmarkManager;
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

    const tabManager = context.tabManager;
    if (!tabManager) {
      return {
        response: '',
        error: 'TabManager not initialized',
      };
    }

    // Use existing tab ID if provided, otherwise create a new LLM response tab
    let tabId = options.tabId || tabManager.openLLMResponseTab(query).tabId;

    // When reusing an existing LLM tab, reset it to streaming state so new chunks attach correctly
    if (options.tabId) {
      const prepareResult = tabManager.prepareLLMTabForStreaming(options.tabId, query);
      if (!prepareResult.success) {
        // Fallback: create a fresh tab if the provided ID is invalid
        const newTab = tabManager.openLLMResponseTab(query);
        tabId = newTab.tabId;
      }
    }

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
      const contextTabs: ContextTabInfo[] = [];
      if (options.selectedTabIds && options.selectedTabIds.length > 0) {
        for (const selectedTabId of options.selectedTabIds) {
          const tab = tabManager.getTab(selectedTabId);
          if (!tab) continue;

          // Build context tab info for persistence
          const contextTabInfo: ContextTabInfo = {
            id: selectedTabId,
            title: tab.title,
            url: tab.url,
            type: tab.type,
            // Include persistent identifiers if this is an LLM response tab
            persistentId: tab.metadata?.persistentId,
            shortId: tab.metadata?.shortId,
            slug: tab.metadata?.slug,
          };
          contextTabs.push(contextTabInfo);

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

      // Persist context metadata before streaming so the UI can render it immediately
      tabManager.updateLLMMetadata(tabId, {
        selectedTabIds: options.selectedTabIds,
        contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      });

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
        tab.metadata.selectedTabIds = options.selectedTabIds;
        tab.metadata.contextTabs = contextTabs.length > 0 ? contextTabs : undefined;

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
          selectedTabIds: options.selectedTabIds,
          contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
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

      // Ensure renderer transitions out of streaming state even on failures
      tabManager.updateLLMResponseTab(tabId, tab?.metadata?.response || '', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // Ensure renderer exits streaming state even if upstream handlers throw
      const preFinishMetadata = tabManager?.getTabMetadataSnapshot(tabId);
      const preFinishTabs = tabManager?.getLLMTabsSnapshot();
      console.log('🔵 [MAIN] Finishing stream', { tabId, preFinishMetadata, preFinishTabs });
      tabManager.updateLLMMetadata(tabId, { isStreaming: false });
      tabManager.markLLMStreamingComplete(tabId);
      const postFinishMetadata = tabManager?.getTabMetadataSnapshot(tabId);
      const postFinishTabs = tabManager?.getLLMTabsSnapshot();
      console.log('🔵 [MAIN] Finished stream', { tabId, postFinishMetadata, postFinishTabs });
    }
  });

  // Content extraction
  ipcMain.handle('extract-content', async (_event, tabId: string, includeScreenshot = false) => {
    const tabManager = context.tabManager;
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
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findInPage(tabId, text);
  });

  ipcMain.handle('find-next', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findNext(tabId);
  });

  ipcMain.handle('find-previous', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.findPrevious(tabId);
  });

  ipcMain.handle('stop-find-in-page', async (_event, tabId: string) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    return tabManager.stopFindInPage(tabId);
  });

  ipcMain.handle('set-search-bar-visible', async (_event, visible: boolean) => {
    const tabManager = context.tabManager;
    if (!tabManager) return { success: false, error: 'TabManager not initialized' };
    tabManager.setSearchBarVisible(visible);
    return { success: true };
  });

  // Screenshot capture
  ipcMain.handle('trigger-screenshot', async () => {
    const screenshotService = context.screenshotService;
    const tabManager = context.tabManager;
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

