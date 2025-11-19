import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Tab management
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  getActiveTabs: () => ipcRenderer.invoke('get-active-tabs'),
  setActiveTab: (tabId) => ipcRenderer.invoke('set-active-tab', tabId),
  selectTabs: (tabIds) => ipcRenderer.invoke('select-tabs', tabIds),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),

  // LLM Query
  sendQuery: (query, options) => ipcRenderer.invoke('send-query', query, options),

  // Event listeners (from main to renderer)
  onTabCreated: (callback) => {
    ipcRenderer.on('tab-created', (event, data) => callback(data));
  },
  onTabClosed: (callback) => {
    ipcRenderer.on('tab-closed', (event, data) => callback(data));
  },
  onTabTitleUpdated: (callback) => {
    ipcRenderer.on('tab-title-updated', (event, data) => callback(data));
  },
  onTabUrlUpdated: (callback) => {
    ipcRenderer.on('tab-url-updated', (event, data) => callback(data));
  },
  onActiveTabChanged: (callback) => {
    ipcRenderer.on('active-tab-changed', (event, data) => callback(data));
  },
});
