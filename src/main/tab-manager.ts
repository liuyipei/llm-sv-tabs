import { BrowserView, BrowserWindow, Menu, MenuItem } from 'electron';
import type { Tab, TabData, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';
import { createNoteHTML } from './templates/note-template.js';
import { createRawMessageViewerHTML } from './templates/raw-message-template.js';

interface TabWithView extends Tab {
  view?: BrowserView;  // Optional for Svelte-rendered tabs
  component?: 'llm-response' | 'note';  // For Svelte-rendered tabs
}

class TabManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, TabWithView>;
  private activeTabId: string | null;
  private activeBrowserView: BrowserView | null;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 350;
  private readonly HEADER_HEIGHT = 53;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.activeBrowserView = null;
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
  private setupContextMenu(view: BrowserView, _tabId: string): void {
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

  /**
   * Set up window open handler to intercept control-click, cmd-click, and middle-click on links
   * This converts new window requests into new tabs
   */
  private setupWindowOpenHandler(view: BrowserView): void {
    view.webContents.setWindowOpenHandler((details) => {
      // Open the URL in a new tab instead of a new window
      this.openUrl(details.url);

      // Deny the window from opening
      return { action: 'deny' };
    });
  }

  openUrl(url: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
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

    // Set up handler for control-click/cmd-click to open links in new tabs
    this.setupWindowOpenHandler(view);

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

    // Extract favicon when page finishes loading
    view.webContents.on('did-finish-load', async () => {
      const favicon = await this.extractFavicon(tabId);
      if (favicon) {
        tab.favicon = favicon;
        this.sendToRenderer('tab-favicon-updated', { id: tabId, favicon });
      }
    });

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(tabId);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openNoteTab(noteId: number, title: string, content: string, fileType: 'text' | 'pdf' | 'image' = 'text', autoSelect: boolean = true): { tabId: string; tab: TabData } {
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
      metadata: {
        fileType: fileType,
        // For image tabs, store the data URL
        imageData: fileType === 'image' ? content : undefined,
        // Extract MIME type from data URL if it's an image
        mimeType: fileType === 'image' && content.startsWith('data:')
          ? content.split(';')[0].split(':')[1]
          : undefined,
      },
    };

    this.tabs.set(tabId, tab);

    // Create HTML content based on file type
    const htmlContent = createNoteHTML(title, content, fileType);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

    // Set up handler for control-click/cmd-click to open links in new tabs
    this.setupWindowOpenHandler(view);

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(tabId);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openLLMResponseTab(query: string, response?: string, error?: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const timestamp = Date.now();
    const isLoading = !response && !error;

    // No BrowserView for LLM responses - use Svelte component instead
    const tab: TabWithView = {
      id: tabId,
      title: error ? 'Error' : (isLoading ? 'Loading...' : 'LLM Response'),
      url: `llm-response://${timestamp}`,
      type: 'notes' as TabType,
      component: 'llm-response',  // Render using Svelte component
      created: timestamp,
      lastViewed: timestamp,
      metadata: {
        isLLMResponse: true,
        query: query,
        response: response,
        error: error,
        isStreaming: isLoading,
      },
    };

    this.tabs.set(tabId, tab);

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(tabId);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  updateLLMResponseTab(tabId: string, response: string, metadata?: any): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Update tab metadata
    if (tab.metadata) {
      tab.metadata.response = response;
      tab.metadata.isStreaming = false;
      if (metadata) {
        Object.assign(tab.metadata, metadata);
      }
    }

    // Update tab title with model and tokens
    if (metadata?.error) {
      tab.title = 'Error';
    } else {
      const modelName = metadata?.model || '';
      // Extract just the model name (last part after final /)
      const shortModelName = modelName.includes('/')
        ? modelName.split('/').pop() || modelName
        : modelName;
      const tokensIn = metadata?.tokensIn || 0;
      const tokensOut = metadata?.tokensOut || 0;

      if (shortModelName && tokensIn > 0 && tokensOut > 0) {
        tab.title = `Response ${shortModelName} up: ${tokensIn.toLocaleString()} down: ${tokensOut.toLocaleString()}`;
      } else if (shortModelName) {
        tab.title = `Response ${shortModelName}`;
      } else {
        tab.title = 'LLM Response';
      }
    }

    // For Svelte component tabs, no need to reload HTML
    // The streaming component will handle the rendering

    // Notify renderer of title update
    this.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });

    // Save session
    this.saveSession();

    return { success: true };
  }

  updateTabTitle(tabId: string, title: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Update the title
    tab.title = title;

    // Notify renderer of title update
    this.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });

    // Save session
    this.saveSession();

    return { success: true };
  }

  openRawMessageViewer(tabId: string, autoSelect: boolean = true): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.metadata?.isLLMResponse) return { success: false, error: 'Not an LLM response tab' };

    const rawViewId = this.createTabId();
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timestamp = Date.now();
    const rawTab: TabWithView = {
      id: rawViewId,
      title: 'Raw Message View',
      url: `raw-message://${timestamp}`,
      type: 'notes' as TabType,
      view: view,
      created: timestamp,
      lastViewed: timestamp,
    };

    this.tabs.set(rawViewId, rawTab);

    // Create HTML for raw message viewer
    const htmlContent = createRawMessageViewerHTML(tab.metadata);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu
    this.setupContextMenu(view, rawViewId);

    // Set up handler for control-click/cmd-click to open links in new tabs
    this.setupWindowOpenHandler(view);

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(rawViewId);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(rawViewId) });

    // Save session
    this.saveSession();

    return { success: true };
  }

  openDebugInfoWindow(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.metadata?.isLLMResponse) return { success: false, error: 'Not an LLM response tab' };

    // Create a new window for debug info
    const debugWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'LLM Debug Info',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Create HTML for debug info viewer with formatted JSON
    const htmlContent = this.createDebugInfoHTML(tab.metadata);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    debugWindow.loadURL(dataUrl);

    // Open DevTools for easy inspection
    debugWindow.webContents.openDevTools();

    return { success: true };
  }

  private createDebugInfoHTML(metadata: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LLM Debug Info</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      margin: 0;
    }
    h1 {
      color: #4ec9b0;
      font-size: 24px;
      margin-bottom: 20px;
    }
    h2 {
      color: #569cd6;
      font-size: 18px;
      margin-top: 30px;
      margin-bottom: 10px;
    }
    .section {
      background-color: #252526;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 20px;
    }
    pre {
      background-color: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .key {
      color: #9cdcfe;
      font-weight: bold;
    }
    .value {
      color: #ce9178;
    }
    .number {
      color: #b5cea8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #3e3e42;
    }
    td:first-child {
      color: #9cdcfe;
      font-weight: bold;
      width: 150px;
    }
    .copy-btn {
      background-color: #007acc;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .copy-btn:hover {
      background-color: #005a9e;
    }
  </style>
</head>
<body>
  <h1>🐛 LLM Debug Information</h1>

  <div class="section">
    <h2>Token Statistics</h2>
    <table>
      <tr>
        <td>Tokens In:</td>
        <td class="number">${metadata.tokensIn || 'N/A'}</td>
      </tr>
      <tr>
        <td>Tokens Out:</td>
        <td class="number">${metadata.tokensOut || 'N/A'}</td>
      </tr>
      <tr>
        <td>Total Tokens:</td>
        <td class="number">${(metadata.tokensIn || 0) + (metadata.tokensOut || 0)}</td>
      </tr>
      <tr>
        <td>Model:</td>
        <td>${metadata.model || 'N/A'}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Query</h2>
    <pre>${this.escapeHtml(metadata.query || 'N/A')}</pre>
  </div>

  ${metadata.fullQuery && metadata.fullQuery !== metadata.query ? `
  <div class="section">
    <h2>Full Query (with context)</h2>
    <pre>${this.escapeHtml(metadata.fullQuery)}</pre>
  </div>
  ` : ''}

  ${metadata.selectedTabIds && metadata.selectedTabIds.length > 0 ? `
  <div class="section">
    <h2>Selected Tabs</h2>
    <pre>${JSON.stringify(metadata.selectedTabIds, null, 2)}</pre>
  </div>
  ` : ''}

  <div class="section">
    <h2>Response</h2>
    <pre>${this.escapeHtml(metadata.response?.substring(0, 5000) || 'N/A')}${(metadata.response?.length || 0) > 5000 ? '\n\n... (truncated, see full metadata below)' : ''}</pre>
  </div>

  ${metadata.error ? `
  <div class="section">
    <h2>Error</h2>
    <pre style="color: #f48771;">${this.escapeHtml(metadata.error)}</pre>
  </div>
  ` : ''}

  <div class="section">
    <h2>Full Metadata Object</h2>
    <button class="copy-btn" onclick="copyMetadata()">Copy JSON</button>
    <pre id="metadata-json">${this.escapeHtml(JSON.stringify(metadata, null, 2))}</pre>
  </div>

  <script>
    function copyMetadata() {
      const text = document.getElementById('metadata-json').textContent;
      const btn = document.querySelector('.copy-btn');
      const originalText = btn.textContent;

      // Try modern clipboard API first, fallback to execCommand for better compatibility
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }).catch(() => {
          // Fallback to execCommand
          copyUsingExecCommand(text, btn, originalText);
        });
      } else {
        // Use execCommand fallback
        copyUsingExecCommand(text, btn, originalText);
      }
    }

    function copyUsingExecCommand(text, btn, originalText) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (err) {
        btn.textContent = 'Copy failed';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
      document.body.removeChild(textarea);
    }
  </script>
</body>
</html>
    `.trim();
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
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

    // Hide previous BrowserView if there was one
    if (this.activeBrowserView) {
      this.mainWindow.removeBrowserView(this.activeBrowserView);
      this.activeBrowserView = null;
    }

    // Show new active tab
    this.activeTabId = tabId;
    tab.lastViewed = Date.now();

    if (tab.view) {
      // Traditional BrowserView tab (webpage, notes, uploads)
      this.mainWindow.addBrowserView(tab.view);
      this.activeBrowserView = tab.view;

      // Position the view to the right of the sidebar and below the header
      const bounds = this.mainWindow.getContentBounds();
      tab.view.setBounds({
        x: this.SIDEBAR_WIDTH,
        y: this.HEADER_HEIGHT,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
        height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
      });
    } else {
      // Svelte component tab (LLM responses)
      // Renderer will show Svelte component in the content area
      this.activeBrowserView = null;
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
      component: tab.component,
      metadata: tab.metadata,
    };
  }

  /**
   * Extract favicon from page
   */
  private async extractFavicon(tabId: string): Promise<string | null> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return null;

    try {
      const result = await tab.view.webContents.executeJavaScript(`
        (function() {
          // Check for icon link tags
          const iconLink = document.querySelector('link[rel~="icon"]');
          if (iconLink) {
            return iconLink.getAttribute('href');
          }

          const shortcutIcon = document.querySelector('link[rel="shortcut icon"]');
          if (shortcutIcon) {
            return shortcutIcon.getAttribute('href');
          }

          // Default favicon location
          return '/favicon.ico';
        })();
      `);

      // Convert relative URLs to absolute
      if (result && !result.startsWith('http')) {
        const url = new URL(tab.url);
        return new URL(result, url.origin).href;
      }

      return result;
    } catch (error) {
      console.error('Failed to extract favicon:', error);
      return null;
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
   * Send streaming chunk to renderer for LLM responses
   */
  sendStreamChunk(tabId: string, chunk: string): void {
    this.mainWindow.webContents.send('llm-stream-chunk', { tabId, chunk });
  }

  /**
   * Get tab by ID
   */
  getTab(tabId: string): TabWithView | undefined {
    return this.tabs.get(tabId);
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

    // Find the index of the previously active tab
    let activeTabIndex = -1;
    if (session.activeTabId) {
      activeTabIndex = session.tabs.findIndex(tab => tab.id === session.activeTabId);
    }

    // Track the new tab IDs as we restore
    const restoredTabIds: string[] = [];

    // Restore each tab without auto-selecting
    for (const tabData of session.tabs) {
      const { tabId } = this.openUrl(tabData.url, false); // Don't auto-select during restoration
      restoredTabIds.push(tabId);
      const tab = this.tabs.get(tabId);
      if (tab && tabData.title !== 'Loading...') {
        tab.title = tabData.title;
      }
    }

    // Restore the active tab based on its index position
    if (activeTabIndex >= 0 && activeTabIndex < restoredTabIds.length) {
      this.setActiveTab(restoredTabIds[activeTabIndex]);
    } else if (restoredTabIds.length > 0) {
      // Fallback: activate the first tab if the active tab index is invalid
      this.setActiveTab(restoredTabIds[0]);
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
