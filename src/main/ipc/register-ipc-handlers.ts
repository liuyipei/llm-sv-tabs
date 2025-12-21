import { ipcMain } from 'electron';
import TabManager from '../tab-manager.js';
import { ContentExtractor } from '../services/content-extractor.js';
import { ModelDiscovery } from '../providers/model-discovery.js';
import { BookmarkManager } from '../services/bookmark-manager.js';
import { ScreenshotService } from '../services/screenshot-service.js';
import { buildCanonicalConversation } from '../vlm-gateway/conversation-builder.js';
import { chat as multimodalChat } from '../vlm-gateway/index.js';
import { getModelCapabilities } from '../vlm-gateway/capabilities.js';
import type { ModelSelector } from '../vlm-gateway/models.js';
import type { ChatOptions } from '../vlm-gateway/pdf-strategies.js';
import type {
  QueryOptions,
  LLMResponse,
  Bookmark,
  ExtractedContent,
  ProviderType,
  ContextTabInfo,
} from '../../types';

export interface MainProcessContext {
  tabManager: TabManager | null;
  bookmarkManager: BookmarkManager | null;
  screenshotService: ScreenshotService | null;
}

type HandlerError = { success: false; error: string };

const toHandlerError = (error: unknown): HandlerError => ({
  success: false,
  error: error instanceof Error ? error.message : String(error),
});

const toLLMError = (error: unknown): LLMResponse => ({
  response: '',
  error: error instanceof Error ? error.message : String(error),
});

const PORTKEY_PROVIDERS: ProviderType[] = [
  'openai',
  'anthropic',
  'gemini',
  'xai',
  'openrouter',
  'fireworks',
  'minimax',
];

function toModelSelector(options: QueryOptions): ModelSelector {
  const provider = options.provider;
  const defaultModel = ModelDiscovery.getDefaultModel(provider) || 'default';
  const model = options.model || defaultModel;

  if (PORTKEY_PROVIDERS.includes(provider)) {
    return {
      providerKind: 'portkey',
      model,
      displayName: model,
      provider,
    };
  }

  return {
    providerKind: 'direct-openai',
    model,
    displayName: model,
    provider,
  };
}

function toChatOptions(options: QueryOptions): ChatOptions {
  return {
    maxTokens: options.maxTokens,
    apiKey: options.apiKey,
    endpoint: options.endpoint,
    portkeyApiKey: options.apiKey,
  };
}

function createContextAccessors(context: MainProcessContext) {
  const ensure = <T>(value: T | null, name: string): T => {
    if (!value) {
      throw new Error(`${name} not initialized`);
    }

    return value;
  };

  return {
    tabManager: () => ensure(context.tabManager, 'TabManager'),
    bookmarkManager: () => ensure(context.bookmarkManager, 'BookmarkManager'),
    screenshotService: () => ensure(context.screenshotService, 'ScreenshotService'),
  };
}

async function handleSafely<T>(
  handler: () => Promise<T> | T
): Promise<T | HandlerError> {
  try {
    return await handler();
  } catch (error) {
    return toHandlerError(error);
  }
}

export function registerIpcHandlers(context: MainProcessContext): void {
  const get = createContextAccessors(context);

  // Tab management
  ipcMain.handle('open-url', async (_event, url: string) =>
    handleSafely(() => {
      const tabManager = get.tabManager();

      // Handle special URL schemes
      if (url.startsWith('api-keys://')) {
        return { success: true, data: tabManager.openApiKeyInstructionsTab() };
      }

      return { success: true, data: tabManager.openUrl(url) };
    })
  );

  ipcMain.handle('close-tab', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().closeTab(tabId))
  );

  ipcMain.handle('get-active-tabs', async () =>
    handleSafely(() => ({ success: true, data: get.tabManager().getActiveTabs() }))
  );

  ipcMain.handle('set-active-tab', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().setActiveTab(tabId))
  );

  ipcMain.handle('focus-active-web-contents', async () =>
    handleSafely(() => get.tabManager().focusActiveWebContents())
  );

  ipcMain.handle('select-tabs', async (_event, tabIds: string[]) =>
    handleSafely(() => ({ success: true, data: get.tabManager().selectTabs(tabIds) }))
  );

  ipcMain.handle('reload-tab', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().reloadTab(tabId))
  );

  ipcMain.handle('go-back', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().goBack(tabId))
  );

  ipcMain.handle('go-forward', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().goForward(tabId))
  );

  ipcMain.handle('get-navigation-state', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().getNavigationState(tabId))
  );

  ipcMain.handle('next-tab', async () => handleSafely(() => get.tabManager().nextTab()));

  ipcMain.handle('previous-tab', async () => handleSafely(() => get.tabManager().previousTab()));

  ipcMain.handle('update-tab-title', async (_event, tabId: string, title: string) =>
    handleSafely(() => get.tabManager().updateTabTitle(tabId, title))
  );

  ipcMain.handle('copy-tab-url', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().copyTabUrl(tabId))
  );

  ipcMain.handle(
    'open-note-tab',
    async (_event, noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string) =>
      handleSafely(() => ({ success: true, data: get.tabManager().openNoteTab(noteId, title, content, fileType, true, filePath) }))
  );

  ipcMain.handle('update-note-content', async (_event, tabId: string, content: string) =>
    handleSafely(() => get.tabManager().updateNoteContent(tabId, content))
  );

  ipcMain.handle('open-llm-response-tab', async (_event, query: string, response?: string, error?: string) =>
    handleSafely(() => ({ success: true, data: get.tabManager().openLLMResponseTab(query, response, error) }))
  );

  ipcMain.handle('update-llm-response-tab', async (_event, tabId: string, response: string, metadata?: any) =>
    handleSafely(() => {
      const result = get.tabManager().updateLLMResponseTab(tabId, response, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('update-llm-metadata', async (_event, tabId: string, metadata: any) =>
    handleSafely(() => {
      const result = get.tabManager().updateLLMMetadata(tabId, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('open-raw-message-viewer', async (_event, tabId: string) =>
    handleSafely(() => {
      const result = get.tabManager().openRawMessageViewer(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('open-debug-info-window', async (_event, tabId: string) =>
    handleSafely(() => {
      const result = get.tabManager().openDebugInfoWindow(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  // Bookmarks
  ipcMain.handle('get-bookmarks', async () =>
    handleSafely(() => ({ success: true, data: get.bookmarkManager().getBookmarks() }))
  );

  ipcMain.handle('add-bookmark', async (_event, bookmark: Omit<Bookmark, 'id' | 'created'>) =>
    handleSafely(() => ({ success: true, data: get.bookmarkManager().addBookmark(bookmark) }))
  );

  ipcMain.handle('delete-bookmark', async (_event, id: string) =>
    handleSafely(() => ({ success: get.bookmarkManager().deleteBookmark(id), data: { id } }))
  );

  // Open a bookmark - handles both web URLs and file-based bookmarks (PDFs, images, text)
  ipcMain.handle('open-bookmark', async (_event, bookmark: Bookmark) =>
    handleSafely(() => {
      const tabManager = get.tabManager();

      // If the bookmark has file path and type, it's a file-based bookmark
      if (bookmark.filePath && bookmark.fileType) {
        // Use the session persistence service to restore the file tab
        return tabManager.openFileFromBookmark(bookmark.title, bookmark.filePath, bookmark.fileType, bookmark.noteId);
      }

      // Note bookmark with persisted content/id
      if (bookmark.noteId !== undefined) {
        const fileType = bookmark.fileType ?? 'text';
        const noteContent = bookmark.noteContent ?? '';
        return { success: true, data: tabManager.openNoteTab(bookmark.noteId, bookmark.title, noteContent, fileType, true, bookmark.filePath) };
      }

      // Legacy note:// bookmarks without metadata
      if (bookmark.url?.toLowerCase().startsWith('note://')) {
        const rawId = bookmark.url.replace('note://', '');
        const parsedId = Number.parseInt(rawId, 10);
        if (!Number.isNaN(parsedId)) {
          const fileType = bookmark.fileType ?? 'text';
          const noteContent = bookmark.noteContent ?? '';
          return { success: true, data: tabManager.openNoteTab(parsedId, bookmark.title, noteContent, fileType, true, bookmark.filePath) };
        }
        return { success: false, error: 'Invalid note bookmark' };
      }

      // Regular web bookmark - use standard openUrl
      return { success: true, data: tabManager.openUrl(bookmark.url) };
    })
  );

  // LLM Query with Streaming
  ipcMain.handle('send-query', async (_event, query: string, options?: QueryOptions): Promise<LLMResponse> => {
    if (!options?.provider) {
      return {
        response: '',
        error: 'Provider is required',
      };
    }

    let tabManager: TabManager;
    try {
      tabManager = get.tabManager();
    } catch (error) {
      return toLLMError(error);
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
      const selector: ModelSelector = toModelSelector(options);
      const chatOptions: ChatOptions = toChatOptions(options);
      const capabilities = await getModelCapabilities(selector, chatOptions.portkeyApiKey);

      const extractedContents: ExtractedContent[] = [];
      const contextTabs: ContextTabInfo[] = [];
      if (options.selectedTabIds && options.selectedTabIds.length > 0) {
        for (const selectedTabId of options.selectedTabIds) {
          const tab = tabManager.getTab(selectedTabId);
          if (!tab) continue;

          const contextTabInfo: ContextTabInfo = {
            id: selectedTabId,
            title: tab.title,
            url: tab.url,
            type: tab.type,
            persistentId: tab.metadata?.persistentId,
            shortId: tab.metadata?.shortId,
            slug: tab.metadata?.slug,
          };
          contextTabs.push(contextTabInfo);

          try {
            if (tab.type === 'notes' || tab.component === 'llm-response') {
              const tabData = tabManager.getTabData(selectedTabId);
              if (tabData) {
                const content = await ContentExtractor.extractFromNoteTab(tabData);
                extractedContents.push(content);
              }
            } else {
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

      const { conversation, fullQuery } = buildCanonicalConversation(
        query,
        options.systemPrompt,
        extractedContents,
        capabilities,
      );

      tabManager.updateLLMMetadata(tabId, {
        selectedTabIds: options.selectedTabIds,
        contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      });

      const response = await multimodalChat(
        selector,
        conversation,
        chatOptions,
        (chunk) => {
          if (chunk.type === 'delta' && chunk.text) {
            tabManager!.sendStreamChunk(tabId, chunk.text);
          }
        },
        capabilities
      );

      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.response = response.text;
        tab.metadata.isStreaming = false;
        tab.metadata.tokensIn = response.tokensIn;
        tab.metadata.tokensOut = response.tokensOut;
        tab.metadata.model = response.model;
        tab.metadata.fullQuery = typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined;
        tab.metadata.selectedTabIds = options.selectedTabIds;
        tab.metadata.contextTabs = contextTabs.length > 0 ? contextTabs : undefined;

        const modelName = response.model || '';
        const tokensIn = response.tokensIn || 0;
        const tokensOut = response.tokensOut || 0;

        if (modelName && tokensIn > 0 && tokensOut > 0) {
          tab.title = `Response ${modelName} up: ${tokensIn.toLocaleString()} down: ${tokensOut.toLocaleString()}`;
        } else if (modelName) {
          tab.title = `Response ${modelName}`;
        }

        tabManager.updateLLMResponseTab(tabId, response.text, {
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          model: response.model,
          error: response.error,
          selectedTabIds: options.selectedTabIds,
          contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
        });
      }

      return {
        ...response,
        response: response.text,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      };
    } catch (error) {
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.error = error instanceof Error ? error.message : String(error);
        tab.metadata.isStreaming = false;
      }

      tabManager.updateLLMResponseTab(tabId, tab?.metadata?.response || '', {
        error: error instanceof Error ? error.message : String(error),
      });

      return toLLMError(error);
    } finally {
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
  ipcMain.handle('extract-content', async (_event, tabId: string, includeScreenshot = false) =>
    handleSafely(async () => {
      const view = get.tabManager().getTabView(tabId);
      if (!view) {
        return { success: false, error: 'Tab not found' } as const;
      }

      const content = await ContentExtractor.extractFromTab(view, tabId, includeScreenshot);
      return { success: true, data: content };
    })
  );

  // Model discovery
  ipcMain.handle('discover-models', async (_event, provider: ProviderType, apiKey?: string, endpoint?: string) =>
    handleSafely(async () => {
      const models = await ModelDiscovery.discoverModels(provider, apiKey, endpoint);
      return { success: true, data: models };
    })
  );

  // Find in page
  ipcMain.handle('find-in-page', async (_event, tabId: string, text: string) =>
    handleSafely(() => get.tabManager().findInPage(tabId, text))
  );

  ipcMain.handle('find-next', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().findNext(tabId))
  );

  ipcMain.handle('find-previous', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().findPrevious(tabId))
  );

  ipcMain.handle('stop-find-in-page', async (_event, tabId: string) =>
    handleSafely(() => get.tabManager().stopFindInPage(tabId))
  );

  ipcMain.handle('set-search-bar-visible', async (_event, visible: boolean) =>
    handleSafely(() => {
      get.tabManager().setSearchBarVisible(visible);
      return { success: true };
    })
  );

  // Screenshot capture
  ipcMain.handle('trigger-screenshot', async () =>
    handleSafely(async () => {
      const screenshotService = get.screenshotService();
      const tabManager = get.tabManager();

      console.log('Main: Starting screenshot capture...');
      const dataUrl = await screenshotService.startCapture();

      if (!dataUrl) {
        console.log('Main: Screenshot was cancelled by user');
        return { success: false, error: 'Screenshot cancelled' } as const;
      }

      console.log('Main: Screenshot captured successfully, creating tab...');

      // Create a new image tab with the screenshot
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
        .replace(/\//g, '-')
        .replace(',', '');

      const title = `Screenshot ${timestamp}`;
      const noteId = Date.now();

      tabManager.openNoteTab(noteId, title, dataUrl, 'image', true);

      console.log('Main: Screenshot tab created successfully');
      return { success: true };
    })
  );
}
