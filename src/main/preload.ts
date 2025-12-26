import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  IPCResponse,
  TabData,
  QueryOptions,
  LLMResponse,
  Bookmark,
  BookmarkResult,
  TabCreatedEvent,
  TabUpdatedEvent,
  TabClosedEvent,
  TabTitleUpdatedEvent,
  TabUrlUpdatedEvent,
  ActiveTabChangedEvent,
  NavigationStateUpdatedEvent,
  ExtractedContent,
  ProviderType,
  LLMModel,
  TabRegistrySnapshot,
} from '../types';

console.log('Preload script is running!');

export type IpcTransport = {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: any[]) => void
  ) => void;
  off: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: any[]) => void
  ) => void;
  removeListener: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: any[]) => void
  ) => void;
};

const defaultTransport: IpcTransport = {
  invoke: ipcRenderer.invoke.bind(ipcRenderer),
  on: ipcRenderer.on.bind(ipcRenderer),
  off: ipcRenderer.off.bind(ipcRenderer),
  removeListener: ipcRenderer.removeListener.bind(ipcRenderer),
};

const createAddListener =
  (transport: IpcTransport) =>
  <T = any>(channel: string, callback: (data: T) => void): (() => void) => {
    const handler = (_event: unknown, data: T) => callback(data);
    transport.on(channel, handler as any);
    return () => transport.off(channel, handler as any);
  };

export const createElectronAPI = (transport: IpcTransport = defaultTransport) => {
  const addListener = createAddListener(transport);

  return {
    // Tab management
    openUrl: (url: string): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
      transport.invoke('open-url', url),

    closeTab: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('close-tab', tabId),

    getActiveTabs: (): Promise<IPCResponse<{ tabs: TabData[]; activeTabId: string | null }>> =>
      transport.invoke('get-active-tabs'),

    setActiveTab: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('set-active-tab', tabId),

    focusActiveWebContents: (): Promise<IPCResponse> =>
      transport.invoke('focus-active-web-contents'),

    selectTabs: (tabIds: string[]): Promise<IPCResponse<{ success: boolean; selectedTabs: string[] }>> =>
      transport.invoke('select-tabs', tabIds),

    reloadTab: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('reload-tab', tabId),

    goBack: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('go-back', tabId),

    goForward: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('go-forward', tabId),

    getNavigationState: (tabId: string): Promise<IPCResponse<{ canGoBack: boolean; canGoForward: boolean }>> =>
      transport.invoke('get-navigation-state', tabId),

    nextTab: (): Promise<IPCResponse<{ tabId: string }>> =>
      transport.invoke('next-tab'),

    previousTab: (): Promise<IPCResponse<{ tabId: string }>> =>
      transport.invoke('previous-tab'),

    updateTabTitle: (tabId: string, title: string): Promise<IPCResponse> =>
      transport.invoke('update-tab-title', tabId, title),

    copyTabUrl: (tabId: string): Promise<IPCResponse<{ url?: string }>> =>
      transport.invoke('copy-tab-url', tabId),

    openAggregateTab: (): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
      transport.invoke('open-aggregate-tab'),

    getTabRegistrySnapshot: (): Promise<IPCResponse<TabRegistrySnapshot>> =>
      transport.invoke('get-tab-registry-snapshot'),

    // Window management
    openNewWindow: (): Promise<IPCResponse<{ windowId: string }>> =>
      transport.invoke('open-new-window'),

    openUrlInNewWindow: (url: string): Promise<IPCResponse<{ windowId: string; tabId?: string }>> =>
      transport.invoke('open-url-in-new-window', url),

    // Note tabs
    openNoteTab: (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
      transport.invoke('open-note-tab', noteId, title, content, fileType, filePath),

    updateNoteContent: (tabId: string, content: string): Promise<IPCResponse> =>
      transport.invoke('update-note-content', tabId, content),

    // LLM Response tabs
    openLLMResponseTab: (query: string, response?: string, error?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
      transport.invoke('open-llm-response-tab', query, response, error),

    updateLLMResponseTab: (tabId: string, response: string, metadata?: any): Promise<IPCResponse> =>
      transport.invoke('update-llm-response-tab', tabId, response, metadata),

    updateLLMMetadata: (tabId: string, metadata: any): Promise<IPCResponse> =>
      transport.invoke('update-llm-metadata', tabId, metadata),

    openRawMessageViewer: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('open-raw-message-viewer', tabId),

    openDebugInfoWindow: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('open-debug-info-window', tabId),

    // Content extraction
    extractContent: (tabId: string): Promise<IPCResponse<ExtractedContent>> =>
      transport.invoke('extract-content', tabId),

    // Bookmarks
    getBookmarks: (): Promise<IPCResponse<Bookmark[]>> =>
      transport.invoke('get-bookmarks'),

    addBookmark: (bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<BookmarkResult>> =>
      transport.invoke('add-bookmark', bookmark),

    deleteBookmark: (id: string): Promise<IPCResponse> =>
      transport.invoke('delete-bookmark', id),

    openBookmark: (bookmark: Bookmark): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
      transport.invoke('open-bookmark', bookmark),

    // LLM Query
    sendQuery: (query: string, options?: QueryOptions): Promise<LLMResponse> =>
      transport.invoke('send-query', query, options),

    // Model discovery
    discoverModels: (provider: ProviderType, apiKey?: string, endpoint?: string): Promise<IPCResponse<LLMModel[]>> =>
      transport.invoke('discover-models', provider, apiKey, endpoint),

    // Screenshot capture
    triggerScreenshot: (): Promise<IPCResponse<{ success: boolean }>> =>
      transport.invoke('trigger-screenshot'),

    // Find in page
    findInPage: (tabId: string, text: string): Promise<IPCResponse<{ requestId?: number }>> =>
      transport.invoke('find-in-page', tabId, text),

    findNext: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('find-next', tabId),

    findPrevious: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('find-previous', tabId),

    stopFindInPage: (tabId: string): Promise<IPCResponse> =>
      transport.invoke('stop-find-in-page', tabId),

    setSearchBarVisible: (visible: boolean): Promise<IPCResponse> =>
      transport.invoke('set-search-bar-visible', visible),

    // Event listeners (from main to renderer)
    onTabCreated: (callback: (data: TabCreatedEvent) => void): () => void =>
      addListener('tab-created', callback),

    onTabUpdated: (callback: (data: TabUpdatedEvent) => void): () => void =>
      addListener('tab-updated', callback),

    onTabClosed: (callback: (data: TabClosedEvent) => void): () => void =>
      addListener('tab-closed', callback),

    onTabTitleUpdated: (callback: (data: TabTitleUpdatedEvent) => void): () => void =>
      addListener('tab-title-updated', callback),

    onTabUrlUpdated: (callback: (data: TabUrlUpdatedEvent) => void): () => void =>
      addListener('tab-url-updated', callback),

    onActiveTabChanged: (callback: (data: ActiveTabChangedEvent) => void): () => void =>
      addListener('active-tab-changed', callback),

    onNavigationStateUpdated: (callback: (data: NavigationStateUpdatedEvent) => void): () => void =>
      addListener('navigation-state-updated', callback),

    onFocusUrlBar: (callback: () => void): () => void =>
      addListener('focus-url-bar', callback),

    onFocusSearchBar: (callback: () => void): () => void =>
      addListener('focus-search-bar', callback),

    onFocusLLMInput: (callback: () => void): () => void =>
      addListener('focus-llm-input', callback),

    onNavigateNextTab: (callback: () => void): () => void =>
      addListener('navigate-next-tab', callback),

    onNavigatePreviousTab: (callback: () => void): () => void =>
      addListener('navigate-previous-tab', callback),

    onBookmarkTab: (callback: () => void): () => void =>
      addListener('bookmark-tab', callback),

    onTriggerScreenshot: (callback: () => void): () => void =>
      addListener('trigger-screenshot', callback),

    onFoundInPage: (callback: (data: { activeMatchOrdinal: number; matches: number }) => void): () => void =>
      addListener('found-in-page', callback),

    onLLMChunk: (callback: (payload: { tabId: string; chunk: string }) => void) => {
      const handler = (_event: unknown, payload: { tabId: string; chunk: string }) => {
        callback(payload);
      };
      transport.on('llm-stream-chunk', handler as any);

      // Return unsubscribe function
      return () => transport.removeListener('llm-stream-chunk', handler as any);
    },

    onTabLoadError: (callback: (data: { id: string; errorCode: number; errorDescription: string; url: string }) => void): void => {
      transport.on('tab-load-error', (_event, data) => callback(data));
    },

    onTabFaviconUpdated: (callback: (data: { id: string; favicon: string }) => void): void => {
      transport.on('tab-favicon-updated', (_event, data) => callback(data));
    },

    // File utilities
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file);
    },

    // Quick list sync for CLI probe tool
    syncQuickList: (models: Array<{ provider: ProviderType; model: string }>): Promise<IPCResponse> =>
      transport.invoke('sync-quick-list', models),

    // Capability probing
    probeModel: (
      provider: ProviderType,
      model: string,
      apiKey?: string,
      endpoint?: string,
    ) => transport.invoke('probe-model', provider, model, apiKey, endpoint),
    loadCapabilityCache: (): Promise<any> => transport.invoke('load-capability-cache'),

    // Secure storage for sensitive data (API keys)
    encryptSecureData: (data: Record<string, string>): Promise<{ success: boolean; data?: Record<string, string>; error?: string }> =>
      transport.invoke('secure-storage-encrypt', data),

    decryptSecureData: (data: Record<string, string>): Promise<{ success: boolean; data?: Record<string, string>; error?: string }> =>
      transport.invoke('secure-storage-decrypt', data),

    isSecureStorageAvailable: (): Promise<boolean> =>
      transport.invoke('secure-storage-is-available'),
  };
};

// Diagnostic: log every tab-updated payload to trace streaming completion signals
defaultTransport.on('tab-updated', (_event, rawData) => {
  const tabData = (rawData as any)?.tab ?? rawData;
  const metadata = tabData?.metadata ?? {};
  const { response: _response, ...metadataWithoutResponse } = metadata;

  console.log('🟢 [PRELOAD] tab-updated', {
    id: tabData?.id,
    streaming: metadata?.isStreaming,
    hasResponse: Boolean(metadata?.response?.length),
    metadata: metadataWithoutResponse,
    timestamp: Date.now(),
  });
});

const electronAPI = createElectronAPI();
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('Preload: electronAPI exposed to window');

// Type definition for window.electronAPI
export type ElectronAPI = ReturnType<typeof createElectronAPI>;
