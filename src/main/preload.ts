import { contextBridge, ipcRenderer } from 'electron';
import type {
  IPCResponse,
  TabData,
  QueryOptions,
  LLMResponse,
  Bookmark,
  TabCreatedEvent,
  TabUpdatedEvent,
  TabClosedEvent,
  TabTitleUpdatedEvent,
  TabUrlUpdatedEvent,
  ActiveTabChangedEvent,
  ExtractedContent,
  ProviderType,
  LLMModel,
} from '../types';

console.log('Preload script is running!');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI = {
  // Tab management
  openUrl: (url: string): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
    ipcRenderer.invoke('open-url', url),

  closeTab: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('close-tab', tabId),

  getActiveTabs: (): Promise<IPCResponse<{ tabs: TabData[]; activeTabId: string | null }>> =>
    ipcRenderer.invoke('get-active-tabs'),

  setActiveTab: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('set-active-tab', tabId),

  focusActiveWebContents: (): Promise<IPCResponse> =>
    ipcRenderer.invoke('focus-active-web-contents'),

  selectTabs: (tabIds: string[]): Promise<IPCResponse<{ success: boolean; selectedTabs: string[] }>> =>
    ipcRenderer.invoke('select-tabs', tabIds),

  reloadTab: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('reload-tab', tabId),

  goBack: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('go-back', tabId),

  goForward: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('go-forward', tabId),

  getNavigationState: (tabId: string): Promise<IPCResponse<{ canGoBack: boolean; canGoForward: boolean }>> =>
    ipcRenderer.invoke('get-navigation-state', tabId),

  nextTab: (): Promise<IPCResponse<{ tabId: string }>> =>
    ipcRenderer.invoke('next-tab'),

  previousTab: (): Promise<IPCResponse<{ tabId: string }>> =>
    ipcRenderer.invoke('previous-tab'),

  updateTabTitle: (tabId: string, title: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('update-tab-title', tabId, title),

  copyTabUrl: (tabId: string): Promise<IPCResponse<{ url?: string }>> =>
    ipcRenderer.invoke('copy-tab-url', tabId),

  // Note tabs
  openNoteTab: (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image'): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
    ipcRenderer.invoke('open-note-tab', noteId, title, content, fileType),

  // LLM Response tabs
  openLLMResponseTab: (query: string, response?: string, error?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }>> =>
    ipcRenderer.invoke('open-llm-response-tab', query, response, error),

  updateLLMResponseTab: (tabId: string, response: string, metadata?: any): Promise<IPCResponse> =>
    ipcRenderer.invoke('update-llm-response-tab', tabId, response, metadata),

  openRawMessageViewer: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('open-raw-message-viewer', tabId),

  openDebugInfoWindow: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('open-debug-info-window', tabId),

  // Content extraction
  extractContent: (tabId: string): Promise<IPCResponse<ExtractedContent>> =>
    ipcRenderer.invoke('extract-content', tabId),

  // Bookmarks
  getBookmarks: (): Promise<IPCResponse<Bookmark[]>> =>
    ipcRenderer.invoke('get-bookmarks'),

  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<Bookmark>> =>
    ipcRenderer.invoke('add-bookmark', bookmark),

  deleteBookmark: (id: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('delete-bookmark', id),

  // LLM Query
  sendQuery: (query: string, options?: QueryOptions): Promise<LLMResponse> =>
    ipcRenderer.invoke('send-query', query, options),

  // Model discovery
  discoverModels: (provider: ProviderType, apiKey?: string, endpoint?: string): Promise<IPCResponse<LLMModel[]>> =>
    ipcRenderer.invoke('discover-models', provider, apiKey, endpoint),

  // Screenshot capture
  triggerScreenshot: (): Promise<IPCResponse<{ success: boolean }>> =>
    ipcRenderer.invoke('trigger-screenshot'),

  // Find in page
  findInPage: (tabId: string, text: string): Promise<IPCResponse<{ requestId?: number }>> =>
    ipcRenderer.invoke('find-in-page', tabId, text),

  findNext: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('find-next', tabId),

  findPrevious: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('find-previous', tabId),

  stopFindInPage: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('stop-find-in-page', tabId),

  setSearchBarVisible: (visible: boolean): Promise<IPCResponse> =>
    ipcRenderer.invoke('set-search-bar-visible', visible),

  // Event listeners (from main to renderer)
  onTabCreated: (callback: (data: TabCreatedEvent) => void): void => {
    ipcRenderer.on('tab-created', (_event, data) => callback(data));
  },

  onTabUpdated: (callback: (data: TabUpdatedEvent) => void): void => {
    ipcRenderer.on('tab-updated', (_event, data) => callback(data));
  },

  onTabClosed: (callback: (data: TabClosedEvent) => void): void => {
    ipcRenderer.on('tab-closed', (_event, data) => callback(data));
  },

  onTabTitleUpdated: (callback: (data: TabTitleUpdatedEvent) => void): void => {
    ipcRenderer.on('tab-title-updated', (_event, data) => callback(data));
  },

  onTabUrlUpdated: (callback: (data: TabUrlUpdatedEvent) => void): void => {
    ipcRenderer.on('tab-url-updated', (_event, data) => callback(data));
  },

  onActiveTabChanged: (callback: (data: ActiveTabChangedEvent) => void): void => {
    ipcRenderer.on('active-tab-changed', (_event, data) => callback(data));
  },

  onFocusUrlBar: (callback: () => void): void => {
    ipcRenderer.on('focus-url-bar', () => callback());
  },

  onFocusSearchBar: (callback: () => void): void => {
    ipcRenderer.on('focus-search-bar', () => callback());
  },

  onFoundInPage: (callback: (data: { activeMatchOrdinal: number; matches: number }) => void): void => {
    ipcRenderer.on('found-in-page', (_event, data) => callback(data));
  },

  onLLMChunk: (callback: (payload: { tabId: string; chunk: string }) => void) => {
    const handler = (_event: unknown, payload: { tabId: string; chunk: string }) => {
      callback(payload);
    };
    ipcRenderer.on('llm-stream-chunk', handler);

    // Return unsubscribe function
    return () => ipcRenderer.removeListener('llm-stream-chunk', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
console.log('Preload: electronAPI exposed to window');

// Type definition for window.electronAPI
export type ElectronAPI = typeof electronAPI;
