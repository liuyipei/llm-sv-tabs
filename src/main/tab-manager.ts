import { BrowserView, BrowserWindow } from 'electron';
import type { Tab, TabData, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';

interface TabWithView extends Tab {
  view: BrowserView;
}

class TabManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, TabWithView>;
  private activeTabId: string | null;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 300;
  private readonly HEADER_HEIGHT = 50;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.tabCounter = 0;
    this.sessionManager = new SessionManager();

    // Handle window resize to update BrowserView bounds
    this.mainWindow.on('resize', () => this.updateBrowserViewBounds());

    // Save session periodically (every 30 seconds)
    setInterval(() => this.saveSession(), 30000);

    // Save session before app quits
    this.mainWindow.on('close', () => {
      this.saveSession();
    });
  }

  private updateBrowserViewBounds(): void {
    if (!this.activeTabId) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.view) return;

    const bounds = this.mainWindow.getContentBounds();
    tab.view.setBounds({
      x: this.SIDEBAR_WIDTH,
      y: this.HEADER_HEIGHT,
      width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
      height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
    });
  }

  private createTabId(): string {
    return `tab-${++this.tabCounter}`;
  }

  openUrl(url: string): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tab: TabWithView = {
      id: tabId,
      title: 'Loading...',
      url: url,
      type: 'webpage' as TabType,
      view: view,
      created: Date.now(),
      lastViewed: Date.now(),
    };

    this.tabs.set(tabId, tab);

    // Load the URL
    view.webContents.loadURL(url);

    // Update title when page loads
    view.webContents.on('page-title-updated', (_event, title) => {
      tab.title = title;
      this.sendToRenderer('tab-title-updated', { id: tabId, title });
    });

    // Handle navigation
    view.webContents.on('did-navigate', (_event, url) => {
      tab.url = url;
      this.sendToRenderer('tab-url-updated', { id: tabId, url });
    });

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  closeTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Destroy the view
    if (tab.view) {
      this.mainWindow.removeBrowserView(tab.view);
      // Note: WebContents cleanup is handled automatically when BrowserView is removed
      // The destroy() method was removed in newer Electron versions
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

    // Save session after tab change
    this.saveSession();

    return { success: true };
  }

  setActiveTab(tabId: string): { success: boolean; error?: string } {
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
    tab.lastViewed = Date.now();

    if (tab.view) {
      this.mainWindow.addBrowserView(tab.view);

      // Position the view to the right of the sidebar and below the header
      const bounds = this.mainWindow.getContentBounds();
      tab.view.setBounds({
        x: this.SIDEBAR_WIDTH,
        y: this.HEADER_HEIGHT,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
        height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
      });
    }

    // Notify renderer
    this.sendToRenderer('active-tab-changed', { id: tabId });

    return { success: true };
  }

  getActiveTabs(): { tabs: TabData[]; activeTabId: string | null } {
    const tabs = Array.from(this.tabs.values()).map((tab) => this.getTabData(tab.id)!);
    return {
      tabs,
      activeTabId: this.activeTabId,
    };
  }

  getTabData(tabId: string): TabData | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      type: tab.type,
    };
  }

  selectTabs(tabIds: string[]): { success: boolean; selectedTabs: string[] } {
    // This is for bulk operations - store selected tabs
    return { success: true, selectedTabs: tabIds };
  }

  reloadTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    if (tab.view && tab.view.webContents) {
      tab.view.webContents.reload();
      return { success: true };
    }

    return { success: false, error: 'Tab view not available' };
  }

  copyTabUrl(tabId: string): { success: boolean; url?: string; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    return { success: true, url: tab.url };
  }

  getTabView(tabId: string): BrowserView | null {
    const tab = this.tabs.get(tabId);
    return tab?.view ?? null;
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Save current session to disk
   */
  private saveSession(): void {
    const tabs = Array.from(this.tabs.values()).map((tab) => this.getTabData(tab.id)!);
    this.sessionManager.saveSession(tabs, this.activeTabId);
  }

  /**
   * Restore session from disk
   */
  restoreSession(): boolean {
    const session = this.sessionManager.loadSession();
    if (!session || session.tabs.length === 0) {
      return false;
    }

    // Restore each tab
    for (const tabData of session.tabs) {
      const { tabId } = this.openUrl(tabData.url);
      const tab = this.tabs.get(tabId);
      if (tab && tabData.title !== 'Loading...') {
        tab.title = tabData.title;
      }
    }

    // Restore active tab
    if (session.activeTabId && this.tabs.has(session.activeTabId)) {
      this.setActiveTab(session.activeTabId);
    }

    return true;
  }

  /**
   * Clear saved session
   */
  clearSession(): void {
    this.sessionManager.clearSession();
  }
}

export default TabManager;
