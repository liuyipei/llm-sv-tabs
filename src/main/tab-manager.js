import { BrowserView } from 'electron';

class TabManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map(); // tabId -> { id, title, url, view, type }
    this.activeTabId = null;
    this.tabCounter = 0;
  }

  createTabId() {
    return `tab-${++this.tabCounter}`;
  }

  openUrl(url) {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tab = {
      id: tabId,
      title: 'Loading...',
      url: url,
      view: view,
      type: 'webpage',
    };

    this.tabs.set(tabId, tab);

    // Load the URL
    view.webContents.loadURL(url);

    // Update title when page loads
    view.webContents.on('page-title-updated', (event, title) => {
      tab.title = title;
      this.sendToRenderer('tab-title-updated', { id: tabId, title });
    });

    // Handle navigation
    view.webContents.on('did-navigate', (event, url) => {
      tab.url = url;
      this.sendToRenderer('tab-url-updated', { id: tabId, url });
    });

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    return { tabId, tab: this.getTabData(tabId) };
  }

  closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Destroy the view
    if (tab.view) {
      this.mainWindow.removeBrowserView(tab.view);
      tab.view.webContents.destroy();
    }

    // Remove from tabs
    this.tabs.delete(tabId);

    // If this was the active tab, switch to another
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      this.activeTabId = remainingTabs.length > 0 ? remainingTabs[0] : null;
      if (this.activeTabId) {
        this.setActiveTab(this.activeTabId);
      }
    }

    // Notify renderer
    this.sendToRenderer('tab-closed', { id: tabId });

    return { success: true };
  }

  setActiveTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Hide current active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab && currentTab.view) {
        this.mainWindow.removeBrowserView(currentTab.view);
      }
    }

    // Show new active tab
    this.activeTabId = tabId;
    if (tab.view) {
      this.mainWindow.addBrowserView(tab.view);

      // Position the view (leave space for UI at top)
      const bounds = this.mainWindow.getBounds();
      tab.view.setBounds({
        x: 0,
        y: 200, // Space for UI
        width: bounds.width,
        height: bounds.height - 200,
      });
    }

    // Notify renderer
    this.sendToRenderer('active-tab-changed', { id: tabId });

    return { success: true };
  }

  getActiveTabs() {
    const tabs = Array.from(this.tabs.values()).map(tab => this.getTabData(tab.id));
    return {
      tabs,
      activeTabId: this.activeTabId,
    };
  }

  getTabData(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      type: tab.type,
    };
  }

  selectTabs(tabIds) {
    // This is for bulk operations - store selected tabs
    return { success: true, selectedTabs: tabIds };
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export default TabManager;
