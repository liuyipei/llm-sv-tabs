import {
  activeTabs,
  activeTabId,
  addTab,
  removeTab,
  updateTabTitle,
  updateTabUrl,
} from '$stores/tabs';
import type { QueryOptions, LLMResponse, Bookmark, Tab, IPCResponse, TabData } from '../../types';

export interface IPCBridgeAPI {
  openUrl(url: string): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  closeTab(tabId: string): Promise<IPCResponse | { success: boolean }>;
  setActiveTab(tabId: string): Promise<IPCResponse | { success: boolean }>;
  selectTabs(tabIds: string[]): Promise<IPCResponse | { success: boolean }>;
  getBookmarks(): Promise<IPCResponse<Bookmark[]> | Bookmark[]>;
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<Bookmark> | { success: boolean }>;
  sendQuery(query: string, options?: QueryOptions): Promise<LLMResponse | { response: string }>;
}

/**
 * Initialize IPC listeners and return IPC API for components
 */
export function initializeIPC(): IPCBridgeAPI {
  // Check if we're in Electron environment
  if (typeof window === 'undefined' || !window.electronAPI) {
    console.warn('Not running in Electron environment');
    return createMockAPI();
  }

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
    getBookmarks: () => window.electronAPI.getBookmarks(),
    addBookmark: (bookmark: Omit<Bookmark, 'id' | 'created'>) => window.electronAPI.addBookmark(bookmark),
    sendQuery: (query: string, options?: QueryOptions) => window.electronAPI.sendQuery(query, options),
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
      const tab: Tab = {
        id: `mock-${Date.now()}`,
        title: url,
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
  };
}
