import { get } from 'svelte/store';
import {
  activeTabs,
  activeTabId,
  addTab,
  removeTab,
  updateTabTitle,
  updateTabUrl,
} from '$stores/tabs';
import type { QueryOptions, LLMResponse, Bookmark, Tab, IPCResponse, TabData, ProviderType, LLMModel } from '../../types';

export interface IPCBridgeAPI {
  openUrl(url: string): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  closeTab(tabId: string): Promise<IPCResponse | { success: boolean }>;
  setActiveTab(tabId: string): Promise<IPCResponse | { success: boolean }>;
  selectTabs(tabIds: string[]): Promise<IPCResponse | { success: boolean }>;
  reloadTab(tabId: string): Promise<IPCResponse | { success: boolean }>;
  updateTabTitle(tabId: string, title: string): Promise<IPCResponse | { success: boolean }>;
  copyTabUrl(tabId: string): Promise<IPCResponse<{ url?: string }> | { success: boolean; url?: string }>;
  openNoteTab(noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image'): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  openLLMResponseTab(query: string, response?: string, error?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  updateLLMResponseTab(tabId: string, response: string, metadata?: any): Promise<IPCResponse | { success: boolean }>;
  openRawMessageViewer(tabId: string): Promise<IPCResponse | { success: boolean }>;
  openDebugInfoWindow(tabId: string): Promise<IPCResponse | { success: boolean }>;
  getBookmarks(): Promise<IPCResponse<Bookmark[]> | Bookmark[]>;
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<Bookmark> | { success: boolean }>;
  sendQuery(query: string, options?: QueryOptions): Promise<LLMResponse | { response: string }>;
  discoverModels(provider: ProviderType, apiKey?: string, endpoint?: string): Promise<IPCResponse<LLMModel[]> | LLMModel[]>;
  onLLMChunk?(callback: (payload: { tabId: string; chunk: string }) => void): () => void;
}

/**
 * Initialize IPC listeners and return IPC API for components
 */
export function initializeIPC(): IPCBridgeAPI {
  console.log('initializeIPC called');
  console.log('window:', typeof window);
  console.log('window.electronAPI:', typeof window !== 'undefined' ? window.electronAPI : 'window is undefined');

  // Check if we're in Electron environment
  if (typeof window === 'undefined' || !window.electronAPI) {
    console.warn('Not running in Electron environment - using mock API');
    return createMockAPI();
  }

  console.log('Using real Electron API');

  // Set up listeners from Electron main process -> Svelte stores
  window.electronAPI.onTabCreated((data) => {
    addTab(data.tab as Tab);
  });

  window.electronAPI.onTabClosed((data) => {
    removeTab(data.id);
  });

  window.electronAPI.onTabTitleUpdated((data) => {
    updateTabTitle(data.id, data.title);
  });

  window.electronAPI.onTabUrlUpdated((data) => {
    updateTabUrl(data.id, data.url);
  });

  window.electronAPI.onActiveTabChanged((data) => {
    activeTabId.set(data.id);
  });

  // Load initial tabs
  loadInitialTabs();

  // Return API for Svelte components to call
  return {
    openUrl: (url: string) => window.electronAPI.openUrl(url),
    closeTab: (tabId: string) => window.electronAPI.closeTab(tabId),
    setActiveTab: (tabId: string) => window.electronAPI.setActiveTab(tabId),
    selectTabs: (tabIds: string[]) => window.electronAPI.selectTabs(tabIds),
    reloadTab: (tabId: string) => window.electronAPI.reloadTab(tabId),
    updateTabTitle: (tabId: string, title: string) => window.electronAPI.updateTabTitle(tabId, title),
    copyTabUrl: (tabId: string) => window.electronAPI.copyTabUrl(tabId),
    openNoteTab: (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image') => window.electronAPI.openNoteTab(noteId, title, content, fileType),
    openLLMResponseTab: (query: string, response?: string, error?: string) => window.electronAPI.openLLMResponseTab(query, response, error),
    updateLLMResponseTab: (tabId: string, response: string, metadata?: any) => window.electronAPI.updateLLMResponseTab(tabId, response, metadata),
    openRawMessageViewer: (tabId: string) => window.electronAPI.openRawMessageViewer(tabId),
    openDebugInfoWindow: (tabId: string) => window.electronAPI.openDebugInfoWindow(tabId),
    getBookmarks: () => window.electronAPI.getBookmarks(),
    addBookmark: (bookmark: Omit<Bookmark, 'id' | 'created'>) => window.electronAPI.addBookmark(bookmark),
    sendQuery: (query: string, options?: QueryOptions) => window.electronAPI.sendQuery(query, options),
    discoverModels: (provider: ProviderType, apiKey?: string, endpoint?: string) => window.electronAPI.discoverModels(provider, apiKey, endpoint),
  };
}

async function loadInitialTabs(): Promise<void> {
  try {
    const response = await window.electronAPI.getActiveTabs();

    if (!response.success || !response.data) {
      console.error('Failed to load tabs:', response.error);
      return;
    }

    const { tabs, activeTabId: activeId } = response.data;

    // Populate activeTabs store
    const tabsMap = new Map<string, Tab>();
    tabs.forEach((tab) => {
      tabsMap.set(tab.id, tab as Tab);
    });
    activeTabs.set(tabsMap);

    // Set active tab
    if (activeId) {
      activeTabId.set(activeId);
    }
  } catch (error) {
    console.error('Failed to load initial tabs:', error);
  }
}

// Mock API for development/testing outside Electron
function createMockAPI(): IPCBridgeAPI {
  console.log('Using mock IPC API');

  return {
    openUrl: async (url: string) => {
      console.log('Mock: openUrl', url);
      const title = url.startsWith('api-keys://') ? 'API Key Instructions' : url;
      const tab: Tab = {
        id: `mock-${Date.now()}`,
        title: title,
        url: url,
        type: 'webpage',
        created: Date.now(),
        lastViewed: Date.now(),
      };
      addTab(tab);
      activeTabId.set(tab.id);
      return { tabId: tab.id, tab };
    },
    closeTab: async (tabId: string) => {
      console.log('Mock: closeTab', tabId);
      removeTab(tabId);
      return { success: true };
    },
    setActiveTab: async (tabId: string) => {
      console.log('Mock: setActiveTab', tabId);
      activeTabId.set(tabId);
      return { success: true };
    },
    selectTabs: async (tabIds: string[]) => {
      console.log('Mock: selectTabs', tabIds);
      return { success: true };
    },
    reloadTab: async (tabId: string) => {
      console.log('Mock: reloadTab', tabId);
      return { success: true };
    },
    updateTabTitle: async (tabId: string, title: string) => {
      console.log('Mock: updateTabTitle', tabId, title);
      updateTabTitle(tabId, title);
      return { success: true };
    },
    copyTabUrl: async (tabId: string) => {
      console.log('Mock: copyTabUrl', tabId);
      const tabs = get(activeTabs);
      const tab = tabs.get(tabId);
      return { success: true, url: tab?.url };
    },
    openNoteTab: async (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image') => {
      console.log('Mock: openNoteTab', noteId, title, content, fileType);
      const tab: Tab = {
        id: `mock-note-${noteId}`,
        title: title,
        url: `note://${noteId}`,
        type: 'notes',
        created: Date.now(),
        lastViewed: Date.now(),
      };
      addTab(tab);
      activeTabId.set(tab.id);
      return { tabId: tab.id, tab };
    },
    openLLMResponseTab: async (query: string, response?: string, error?: string) => {
      console.log('Mock: openLLMResponseTab', query, response, error);
      const timestamp = Date.now();
      const tab: Tab = {
        id: `mock-llm-${timestamp}`,
        title: error ? 'Error' : (response ? 'LLM Response' : 'Loading...'),
        url: `llm-response://${timestamp}`,
        type: 'notes',
        created: timestamp,
        lastViewed: timestamp,
      };
      addTab(tab);
      activeTabId.set(tab.id);
      return { tabId: tab.id, tab };
    },
    updateLLMResponseTab: async (tabId: string, response: string, metadata?: any) => {
      console.log('Mock: updateLLMResponseTab', tabId, response, metadata);
      return { success: true };
    },
    openRawMessageViewer: async (tabId: string) => {
      console.log('Mock: openRawMessageViewer', tabId);
      return { success: true };
    },
    openDebugInfoWindow: async (tabId: string) => {
      console.log('Mock: openDebugInfoWindow', tabId);
      return { success: true };
    },
    getBookmarks: async (): Promise<Bookmark[]> => {
      console.log('Mock: getBookmarks');
      return [];
    },
    addBookmark: async (bookmark: Omit<Bookmark, 'id' | 'created'>) => {
      console.log('Mock: addBookmark', bookmark);
      return { success: true };
    },
    sendQuery: async (query: string, options?: QueryOptions): Promise<LLMResponse> => {
      console.log('Mock: sendQuery', query, options);
      return {
        response: `Mock response for: ${query}`,
        tokensUsed: 0,
        responseTime: 100,
        model: options?.model || 'mock-model',
      };
    },
    discoverModels: async (provider: ProviderType, apiKey?: string, endpoint?: string): Promise<LLMModel[]> => {
      console.log('Mock: discoverModels', provider, apiKey, endpoint);
      return [
        { id: 'mock-model-1', name: 'Mock Model 1', provider },
        { id: 'mock-model-2', name: 'Mock Model 2', provider },
      ];
    },
  };
}
