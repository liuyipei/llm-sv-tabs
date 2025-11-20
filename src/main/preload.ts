import { contextBridge, ipcRenderer } from 'electron';
import type {
  IPCResponse,
  TabData,
  QueryOptions,
  LLMResponse,
  Bookmark,
  TabCreatedEvent,
  TabClosedEvent,
  TabTitleUpdatedEvent,
  TabUrlUpdatedEvent,
  ActiveTabChangedEvent,
  ExtractedContent,
} from '../types';

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

  selectTabs: (tabIds: string[]): Promise<IPCResponse<{ success: boolean; selectedTabs: string[] }>> =>
    ipcRenderer.invoke('select-tabs', tabIds),

  reloadTab: (tabId: string): Promise<IPCResponse> =>
    ipcRenderer.invoke('reload-tab', tabId),

  copyTabUrl: (tabId: string): Promise<IPCResponse<{ url?: string }>> =>
    ipcRenderer.invoke('copy-tab-url', tabId),

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

  // Event listeners (from main to renderer)
  onTabCreated: (callback: (data: TabCreatedEvent) => void): void => {
    ipcRenderer.on('tab-created', (_event, data) => callback(data));
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type definition for window.electronAPI
export type ElectronAPI = typeof electronAPI;
