import { get } from 'svelte/store';
import {
  activeTabs,
  activeTabId,
  addTab,
  removeTab,
  updateTab,
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
  goBack(tabId: string): Promise<IPCResponse | { success: boolean }>;
  goForward(tabId: string): Promise<IPCResponse | { success: boolean }>;
  getNavigationState(tabId: string): Promise<IPCResponse<{ canGoBack: boolean; canGoForward: boolean }> | { success: boolean; canGoBack: boolean; canGoForward: boolean }>;
  nextTab(): Promise<IPCResponse<{ tabId: string }> | { success: boolean; tabId?: string }>;
  previousTab(): Promise<IPCResponse<{ tabId: string }> | { success: boolean; tabId?: string }>;
  updateTabTitle(tabId: string, title: string): Promise<IPCResponse | { success: boolean }>;
  copyTabUrl(tabId: string): Promise<IPCResponse<{ url?: string }> | { success: boolean; url?: string }>;
  openNoteTab(noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  updateNoteContent(tabId: string, content: string): Promise<IPCResponse | { success: boolean }>;
  openLLMResponseTab(query: string, response?: string, error?: string): Promise<IPCResponse<{ tabId: string; tab: TabData }> | { tabId: string; tab: Tab }>;
  updateLLMResponseTab(tabId: string, response: string, metadata?: any): Promise<IPCResponse | { success: boolean }>;
  updateLLMMetadata(tabId: string, metadata: any): Promise<IPCResponse | { success: boolean }>;
  openRawMessageViewer(tabId: string): Promise<IPCResponse | { success: boolean }>;
  openDebugInfoWindow(tabId: string): Promise<IPCResponse | { success: boolean }>;
  getBookmarks(): Promise<IPCResponse<Bookmark[]> | Bookmark[]>;
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<{ bookmark: Bookmark; isNew: boolean }> | { success: boolean }>;
  deleteBookmark(id: string): Promise<IPCResponse | { success: boolean }>;
  sendQuery(query: string, options?: QueryOptions): Promise<LLMResponse | { response: string }>;
  discoverModels(provider: ProviderType, apiKey?: string, endpoint?: string): Promise<IPCResponse<LLMModel[]> | LLMModel[]>;
  triggerScreenshot(): Promise<IPCResponse<{ success: boolean }>>;
  findInPage(tabId: string, text: string): Promise<IPCResponse<{ requestId?: number }> | { success: boolean }>;
  findNext(tabId: string): Promise<IPCResponse | { success: boolean }>;
  findPrevious(tabId: string): Promise<IPCResponse | { success: boolean }>;
  stopFindInPage(tabId: string): Promise<IPCResponse | { success: boolean }>;
  setSearchBarVisible(visible: boolean): Promise<IPCResponse | { success: boolean }>;
  focusActiveWebContents(): Promise<IPCResponse | { success: boolean; error?: string }>;
  onLLMChunk?(callback: (payload: { tabId: string; chunk: string }) => void): () => void;
  onNavigationStateUpdated(
    callback: (payload: { id: string; canGoBack: boolean; canGoForward: boolean }) => void,
  ): void;
  getPathForFile?(file: File): string;
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

  window.electronAPI.onTabUpdated((data) => {
    updateTab(data.tab.id, data.tab as Partial<Tab>);
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

  if (typeof window.electronAPI.onNavigationStateUpdated === 'function') {
    window.electronAPI.onNavigationStateUpdated((data) => {
      const tab = get(activeTabs).get(data.id);
      if (tab) {
        updateTab(tab.id, {
          metadata: { ...tab.metadata, canGoBack: data.canGoBack, canGoForward: data.canGoForward },
        });
      }
    });
  }

  // Handle tab load errors
  window.electronAPI.onTabLoadError((data) => {
    console.error(`Tab ${data.id} failed to load: ${data.errorDescription} (code: ${data.errorCode})`);
    updateTab(data.id, {
      loadError: {
        errorCode: data.errorCode,
        errorDescription: data.errorDescription,
      },
    });
  });

  // Handle favicon updates
  window.electronAPI.onTabFaviconUpdated((data) => {
    updateTab(data.id, { favicon: data.favicon });
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
    goBack: (tabId: string) => window.electronAPI.goBack(tabId),
    goForward: (tabId: string) => window.electronAPI.goForward(tabId),
    getNavigationState: (tabId: string) => window.electronAPI.getNavigationState(tabId),
    nextTab: () => window.electronAPI.nextTab(),
    previousTab: () => window.electronAPI.previousTab(),
    updateTabTitle: (tabId: string, title: string) => window.electronAPI.updateTabTitle(tabId, title),
    copyTabUrl: (tabId: string) => window.electronAPI.copyTabUrl(tabId),
    openNoteTab: (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string) => window.electronAPI.openNoteTab(noteId, title, content, fileType, filePath),
    updateNoteContent: (tabId: string, content: string) => window.electronAPI.updateNoteContent(tabId, content),
    openLLMResponseTab: (query: string, response?: string, error?: string) => window.electronAPI.openLLMResponseTab(query, response, error),
    updateLLMResponseTab: (tabId: string, response: string, metadata?: any) => window.electronAPI.updateLLMResponseTab(tabId, response, metadata),
    updateLLMMetadata: (tabId: string, metadata: any) => window.electronAPI.updateLLMMetadata(tabId, metadata),
    openRawMessageViewer: (tabId: string) => window.electronAPI.openRawMessageViewer(tabId),
    openDebugInfoWindow: (tabId: string) => window.electronAPI.openDebugInfoWindow(tabId),
    getBookmarks: () => window.electronAPI.getBookmarks(),
    addBookmark: (bookmark: Omit<Bookmark, 'id' | 'created'>) => window.electronAPI.addBookmark(bookmark),
    deleteBookmark: (id: string) => window.electronAPI.deleteBookmark(id),
    sendQuery: (query: string, options?: QueryOptions) => window.electronAPI.sendQuery(query, options),
    discoverModels: (provider: ProviderType, apiKey?: string, endpoint?: string) => window.electronAPI.discoverModels(provider, apiKey, endpoint),
    triggerScreenshot: () => window.electronAPI.triggerScreenshot(),
    findInPage: (tabId: string, text: string) => window.electronAPI.findInPage(tabId, text),
    findNext: (tabId: string) => window.electronAPI.findNext(tabId),
    findPrevious: (tabId: string) => window.electronAPI.findPrevious(tabId),
    stopFindInPage: (tabId: string) => window.electronAPI.stopFindInPage(tabId),
    setSearchBarVisible: (visible: boolean) => window.electronAPI.setSearchBarVisible(visible),
    focusActiveWebContents: () => window.electronAPI.focusActiveWebContents(),
    onNavigationStateUpdated: (callback) => window.electronAPI.onNavigationStateUpdated(callback),
    getPathForFile: (file: File) => window.electronAPI.getPathForFile(file),
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
    goBack: async (tabId: string) => {
      console.log('Mock: goBack', tabId);
      return { success: true };
    },
    goForward: async (tabId: string) => {
      console.log('Mock: goForward', tabId);
      return { success: true };
    },
    getNavigationState: async (tabId: string) => {
      console.log('Mock: getNavigationState', tabId);
      return { success: true, canGoBack: false, canGoForward: false };
    },
    nextTab: async () => {
      console.log('Mock: nextTab');
      const tabs = get(activeTabs);
      const tabIds = Array.from(tabs.keys());
      const currentId = get(activeTabId);
      if (tabIds.length > 0 && currentId) {
        const currentIndex = tabIds.indexOf(currentId);
        const nextIndex = (currentIndex + 1) % tabIds.length;
        const nextTabId = tabIds[nextIndex];
        activeTabId.set(nextTabId);
        return { success: true, tabId: nextTabId };
      }
      return { success: false };
    },
    previousTab: async () => {
      console.log('Mock: previousTab');
      const tabs = get(activeTabs);
      const tabIds = Array.from(tabs.keys());
      const currentId = get(activeTabId);
      if (tabIds.length > 0 && currentId) {
        const currentIndex = tabIds.indexOf(currentId);
        const previousIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
        const previousTabId = tabIds[previousIndex];
        activeTabId.set(previousTabId);
        return { success: true, tabId: previousTabId };
      }
      return { success: false };
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
    openNoteTab: async (noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string) => {
      console.log('Mock: openNoteTab', noteId, title, content, fileType, filePath);
      const url = fileType === 'text'
        ? (content.trim().substring(0, 30) + (content.length > 30 ? '...' : '')) || 'note://empty'
        : `note://${noteId}`;
      const tab: Tab = {
        id: `mock-note-${noteId}`,
        title: title,
        url: url,
        type: 'notes',
        component: fileType === 'text' ? 'note' : undefined,
        created: Date.now(),
        lastViewed: Date.now(),
        metadata: {
          fileType: fileType,
          noteContent: fileType === 'text' ? content : undefined,
          filePath: filePath,
        },
      };
      addTab(tab);
      activeTabId.set(tab.id);
      return { tabId: tab.id, tab };
    },
    updateNoteContent: async (tabId: string, content: string) => {
      console.log('Mock: updateNoteContent', tabId, content);
      const url = content.trim().substring(0, 30) + (content.length > 30 ? '...' : '') || 'note://empty';
      updateTab(tabId, { url, metadata: { noteContent: content } });
      return { success: true };
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
    updateLLMMetadata: async (tabId: string, metadata: any) => {
      console.log('Mock: updateLLMMetadata', tabId, metadata);
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
      return {
        success: true,
        data: {
          bookmark: {
            ...bookmark,
            id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            created: Date.now(),
          },
          isNew: true,
        },
      };
    },
    deleteBookmark: async (id: string) => {
      console.log('Mock: deleteBookmark', id);
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
    triggerScreenshot: async () => {
      console.log('Mock: triggerScreenshot');
      return { success: true, data: { success: true } };
    },
    findInPage: async (tabId: string, text: string) => {
      console.log('Mock: findInPage', tabId, text);
      return { success: true };
    },
    findNext: async (tabId: string) => {
      console.log('Mock: findNext', tabId);
      return { success: true };
    },
    findPrevious: async (tabId: string) => {
      console.log('Mock: findPrevious', tabId);
      return { success: true };
    },
    stopFindInPage: async (tabId: string) => {
      console.log('Mock: stopFindInPage', tabId);
      return { success: true };
    },
    setSearchBarVisible: async (visible: boolean) => {
      console.log('Mock: setSearchBarVisible', visible);
      return { success: true };
    },
    focusActiveWebContents: async () => {
      console.log('Mock: focusActiveWebContents');
      return { success: true };
    },
    onNavigationStateUpdated: (callback) => {
      console.log('Mock: onNavigationStateUpdated');
      callback({ id: 'mock', canGoBack: false, canGoForward: false });
    },
    getPathForFile: (file: File) => {
      console.log('Mock: getPathForFile', file.name);
      return ''; // Mock returns empty path
    },
  };
}
