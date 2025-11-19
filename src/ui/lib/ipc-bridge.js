import {
  activeTabs,
  activeTabId,
  addTab,
  removeTab,
  updateTabTitle,
  updateTabUrl,
} from '$stores/tabs';

/**
 * Initialize IPC listeners and return IPC API for components
 */
export function initializeIPC() {
  // Check if we're in Electron environment
  if (typeof window === 'undefined' || !window.electronAPI) {
    console.warn('Not running in Electron environment');
    return createMockAPI();
  }

  // Set up listeners from Electron main process -> Svelte stores
  window.electronAPI.onTabCreated((data) => {
    addTab(data.tab);
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
    openUrl: (url) => window.electronAPI.openUrl(url),
    closeTab: (tabId) => window.electronAPI.closeTab(tabId),
    setActiveTab: (tabId) => window.electronAPI.setActiveTab(tabId),
    selectTabs: (tabIds) => window.electronAPI.selectTabs(tabIds),
    getBookmarks: () => window.electronAPI.getBookmarks(),
    addBookmark: (bookmark) => window.electronAPI.addBookmark(bookmark),
    sendQuery: (query, options) => window.electronAPI.sendQuery(query, options),
  };
}

async function loadInitialTabs() {
  try {
    const data = await window.electronAPI.getActiveTabs();

    // Populate activeTabs store
    const tabsMap = new Map();
    data.tabs.forEach((tab) => {
      tabsMap.set(tab.id, tab);
    });
    activeTabs.set(tabsMap);

    // Set active tab
    if (data.activeTabId) {
      activeTabId.set(data.activeTabId);
    }
  } catch (error) {
    console.error('Failed to load initial tabs:', error);
  }
}

// Mock API for development/testing outside Electron
function createMockAPI() {
  console.log('Using mock IPC API');

  return {
    openUrl: async (url) => {
      console.log('Mock: openUrl', url);
      const tab = {
        id: `mock-${Date.now()}`,
        title: url,
        url: url,
        type: 'webpage',
      };
      addTab(tab);
      activeTabId.set(tab.id);
      return { tabId: tab.id, tab };
    },
    closeTab: async (tabId) => {
      console.log('Mock: closeTab', tabId);
      removeTab(tabId);
      return { success: true };
    },
    setActiveTab: async (tabId) => {
      console.log('Mock: setActiveTab', tabId);
      activeTabId.set(tabId);
      return { success: true };
    },
    selectTabs: async (tabIds) => {
      console.log('Mock: selectTabs', tabIds);
      return { success: true };
    },
    getBookmarks: async () => {
      console.log('Mock: getBookmarks');
      return [];
    },
    addBookmark: async (bookmark) => {
      console.log('Mock: addBookmark', bookmark);
      return { success: true };
    },
    sendQuery: async (query, options) => {
      console.log('Mock: sendQuery', query, options);
      return { response: `Mock response for: ${query}` };
    },
  };
}
