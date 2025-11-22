import { BrowserView, BrowserWindow, Menu, MenuItem, shell } from 'electron';
import type { Tab, TabData, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';

interface TabWithView extends Tab {
  view: BrowserView;
  thumbnail?: string;
}

class TabManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, TabWithView>;
  private activeTabId: string | null;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 350;
  private readonly HEADER_HEIGHT = 53;

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

  /**
   * Set up context menu for a BrowserView to handle right-clicks on links
   */
  private setupContextMenu(view: BrowserView, tabId: string): void {
    view.webContents.on('context-menu', (_event, params) => {
      const { linkURL, x, y } = params;

      // Only show our custom menu if right-clicking on a link
      if (!linkURL) return;

      const menu = new Menu();

      // Open link in new tab
      menu.append(new MenuItem({
        label: 'Open link in new tab',
        click: () => {
          this.openUrl(linkURL);
        }
      }));

      // Save link as
      menu.append(new MenuItem({
        label: 'Save link as...',
        click: async () => {
          try {
            await view.webContents.downloadURL(linkURL);
          } catch (error) {
            console.error('Failed to download:', error);
          }
        }
      }));

      // Separator
      menu.append(new MenuItem({ type: 'separator' }));

      // Inspect element
      menu.append(new MenuItem({
        label: 'Inspect',
        click: () => {
          view.webContents.inspectElement(x, y);
          if (!view.webContents.isDevToolsOpened()) {
            view.webContents.openDevTools();
          }
        }
      }));

      menu.popup();
    });
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

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

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

    // Capture thumbnail when page finishes loading
    view.webContents.on('did-finish-load', () => {
      this.captureThumbnail(tabId);
    });

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openNoteTab(noteId: number, title: string, content: string): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tab: TabWithView = {
      id: tabId,
      title: title,
      url: `note://${noteId}`,
      type: 'notes' as TabType,
      view: view,
      created: Date.now(),
      lastViewed: Date.now(),
    };

    this.tabs.set(tabId, tab);

    // Create HTML content for the note
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: #1e1e1e;
      color: #d4d4d4;
      line-height: 1.6;
    }
    h1 {
      color: #ffffff;
      border-bottom: 2px solid #007acc;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    pre {
      background-color: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .note-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="note-content">${this.escapeHtml(content)}</div>
</body>
</html>
    `.trim();

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
      thumbnail: tab.thumbnail,
    };
  }

  /**
   * Capture thumbnail for a tab
   */
  private async captureThumbnail(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return;

    try {
      // Capture page at smaller size for thumbnail (160x90 for 16:9 aspect ratio)
      const image = await tab.view.webContents.capturePage({
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      });

      // Resize to thumbnail size
      const thumbnail = image.resize({ width: 160, height: 90 });
      const dataUrl = thumbnail.toDataURL();

      // Store thumbnail
      tab.thumbnail = dataUrl;

      // Notify renderer
      this.sendToRenderer('tab-thumbnail-updated', { id: tabId, thumbnail: dataUrl });
    } catch (error) {
      console.error('Failed to capture thumbnail:', error);
    }
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
    const tabs = Array.from(this.tabs.values())
      .map((tab) => this.getTabData(tab.id)!)
      .filter((tab) => tab.type !== 'notes' && tab.type !== 'upload'); // Don't persist note tabs
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
