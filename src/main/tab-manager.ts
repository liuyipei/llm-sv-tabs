import { WebContentsView, BrowserWindow, Menu, MenuItem } from 'electron';
import type { Tab, TabData, TabMetadata, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';
import { createNoteHTML } from './templates/note-template.js';
import { createRawMessageViewerHTML } from './templates/raw-message-template.js';
import { createDebugInfoHTML } from './templates/debug-info-template.js';
import { generateLLMTabIdentifiers } from './utils/tab-id-generator.js';

interface TabWithView extends Tab {
  view?: WebContentsView;  // Optional for Svelte-rendered tabs
  component?: 'llm-response' | 'note' | 'api-key-instructions';  // For Svelte-rendered tabs
}

class TabManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, TabWithView>;
  private activeTabId: string | null;
  private activeWebContentsView: WebContentsView | null;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 350;
  private readonly HEADER_HEIGHT = 53;
  private readonly SEARCH_BAR_HEIGHT = 45; // Height of the search bar when visible
  private lastMetadataUpdate: Map<string, number>; // Track last metadata update time per tab
  private readonly METADATA_UPDATE_THROTTLE_MS = 500; // Send metadata updates at most every 500ms
  private currentFindRequestId: number = 0; // Track find-in-page request IDs
  private isSearchBarVisible: boolean = false; // Track search bar visibility
  private lastSearchText: Map<string, string> = new Map(); // Track last search text per tab

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.activeWebContentsView = null;
    this.tabCounter = 0;
    this.sessionManager = new SessionManager();
    this.lastMetadataUpdate = new Map();

    // Handle window resize to update WebContentsView bounds
    this.mainWindow.on('resize', () => this.updateWebContentsViewBounds());

    // Save session periodically (every 30 seconds)
    setInterval(() => this.saveSession(), 30000);

    // Save session before app quits
    this.mainWindow.on('close', () => {
      this.saveSession();
    });
  }

  private updateWebContentsViewBounds(): void {
    if (!this.activeTabId) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.view) return;

    // Check if the view's webContents has been destroyed
    if (tab.view.webContents.isDestroyed()) {
      console.warn(`Tab ${this.activeTabId} has a destroyed webContents, skipping bounds update`);
      return;
    }

    try {
      const bounds = this.mainWindow.getContentBounds();
      const headerHeight = this.HEADER_HEIGHT + (this.isSearchBarVisible ? this.SEARCH_BAR_HEIGHT : 0);
      tab.view.setBounds({
        x: this.SIDEBAR_WIDTH,
        y: headerHeight,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
        height: Math.max(0, bounds.height - headerHeight),
      });
    } catch (error) {
      // Handle race condition where view is destroyed between check and usage
      if (error instanceof Error && error.message.includes('destroyed')) {
        console.warn(`Tab ${this.activeTabId} was destroyed during bounds update`);
      } else {
        throw error; // Re-throw if it's not a destroyed object error
      }
    }
  }

  /**
   * Set whether the search bar is visible (affects WebContentsView bounds)
   */
  setSearchBarVisible(visible: boolean): void {
    this.isSearchBarVisible = visible;
    this.updateWebContentsViewBounds();
  }

  private createTabId(): string {
    return `tab-${++this.tabCounter}`;
  }

  private createConfiguredView(tabId: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    this.setupContextMenu(view, tabId);
    this.setupWindowOpenHandler(view);

    return view;
  }

  /**
   * Set up context menu for a WebContentsView to handle right-clicks on links
   */
  private setupContextMenu(view: WebContentsView, _tabId: string): void {
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
  private setupWindowOpenHandler(view: WebContentsView): void {
    view.webContents.setWindowOpenHandler((details) => {
      // Only intercept explicit tab requests (e.g. ctrl/cmd click or middle-click)
      if (details.disposition === 'foreground-tab' || details.disposition === 'background-tab') {
        // Open the URL in a new tab instead of a new window
        this.openUrl(details.url);

        // Deny the window from opening
        return { action: 'deny' };
      }

      // Allow other window.open uses (e.g. OAuth popups) to proceed normally
      return { action: 'allow' };
    });
  }

  openUrl(url: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = this.createConfiguredView(tabId);

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

    const view = this.createConfiguredView(tabId);

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

    // Generate persistent identifiers for this LLM conversation
    const identifiers = generateLLMTabIdentifiers(query, timestamp);

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
        // Persistent identifiers
        persistentId: identifiers.persistentId,
        shortId: identifiers.shortId,
        slug: identifiers.slug,
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

  openApiKeyInstructionsTab(autoSelect: boolean = true): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();
    const timestamp = Date.now();

    // No BrowserView for API key instructions - use Svelte component instead
    const tab: TabWithView = {
      id: tabId,
      title: 'Where to get API Keys',
      url: `api-keys://instructions`,
      type: 'notes' as TabType,
      component: 'api-key-instructions',  // Render using Svelte component
      created: timestamp,
      lastViewed: timestamp,
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

  /**
   * Update metadata on an in-progress LLM tab without ending streaming
   */
  updateLLMMetadata(tabId: string, metadata: Partial<TabMetadata>): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab?.metadata) {
      return { success: false, error: 'Tab not found or missing metadata' };
    }

    Object.assign(tab.metadata, metadata);
    this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });

    return { success: true };
  }

  /**
   * Force a streaming session to finish and notify the renderer, even if
   * upstream handlers failed to send a final update.
   */
  markLLMStreamingComplete(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    if (!tab.metadata) {
      tab.metadata = {};
    }

    tab.metadata.isStreaming = false;

    // Clear throttle tracking so future streams can update immediately
    this.lastMetadataUpdate.delete(tabId);

    this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });
  }

  /**
   * Reset an existing LLM tab so it can be reused for a new streaming request
   */
  prepareLLMTabForStreaming(tabId: string, query: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.metadata?.isLLMResponse) {
      return { success: false, error: 'Tab not found or not an LLM response tab' };
    }

    // Reset metadata for the new request
    tab.metadata.response = '';
    tab.metadata.error = undefined;
    tab.metadata.isStreaming = true;
    tab.metadata.query = query;
    tab.metadata.tokensIn = undefined;
    tab.metadata.tokensOut = undefined;
    tab.metadata.model = undefined;
    tab.metadata.fullQuery = undefined;
    tab.metadata.contextTabs = undefined;
    tab.metadata.selectedTabIds = undefined;

    // Update tab title to reflect loading state
    tab.title = 'Loading...';

    // Notify renderer of updates
    this.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });
    this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });

    // Clear throttling to allow immediate updates for the new stream
    this.lastMetadataUpdate.delete(tabId);

    // Save session state
    this.saveSession();

    return { success: true };
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

    // Notify renderer of metadata update (important for Svelte components)
    this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });

    // Clear throttle tracking now that streaming is complete
    this.lastMetadataUpdate.delete(tabId);

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
    const view = this.createConfiguredView(rawViewId);

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
    const htmlContent = createDebugInfoHTML(tab.metadata);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    debugWindow.loadURL(dataUrl);

    return { success: true };
  }

  /**
   * Navigate back in the tab's history
   */
  goBack(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    try {
      if (tab.view.webContents.navigationHistory.canGoBack()) {
        tab.view.webContents.navigationHistory.goBack();
        return { success: true };
      }
      return { success: false, error: 'Cannot go back' };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  /**
   * Navigate forward in the tab's history
   */
  goForward(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    try {
      if (tab.view.webContents.navigationHistory.canGoForward()) {
        tab.view.webContents.navigationHistory.goForward();
        return { success: true };
      }
      return { success: false, error: 'Cannot go forward' };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  /**
   * Get navigation state for a tab (whether it can go back/forward)
   */
  getNavigationState(tabId: string): { success: boolean; canGoBack?: boolean; canGoForward?: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) {
      // For Svelte component tabs, navigation is not supported
      return { success: true, canGoBack: false, canGoForward: false };
    }
    if (tab.view.webContents.isDestroyed()) {
      return { success: true, canGoBack: false, canGoForward: false };
    }

    try {
      return {
        success: true,
        canGoBack: tab.view.webContents.navigationHistory.canGoBack(),
        canGoForward: tab.view.webContents.navigationHistory.canGoForward(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: true, canGoBack: false, canGoForward: false };
      }
      throw error;
    }
  }

  /**
   * Switch to the next tab
   */
  nextTab(): { success: boolean; tabId?: string; error?: string } {
    const tabIds = Array.from(this.tabs.keys());
    if (tabIds.length === 0) return { success: false, error: 'No tabs available' };
    if (!this.activeTabId) return { success: false, error: 'No active tab' };

    const currentIndex = tabIds.indexOf(this.activeTabId);
    const nextIndex = (currentIndex + 1) % tabIds.length;
    const nextTabId = tabIds[nextIndex];

    this.setActiveTab(nextTabId);
    return { success: true, tabId: nextTabId };
  }

  /**
   * Switch to the previous tab
   */
  previousTab(): { success: boolean; tabId?: string; error?: string } {
    const tabIds = Array.from(this.tabs.keys());
    if (tabIds.length === 0) return { success: false, error: 'No tabs available' };
    if (!this.activeTabId) return { success: false, error: 'No active tab' };

    const currentIndex = tabIds.indexOf(this.activeTabId);
    const previousIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    const previousTabId = tabIds[previousIndex];

    this.setActiveTab(previousTabId);
    return { success: true, tabId: previousTabId };
  }

  closeTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Destroy the view
    if (tab.view) {
      this.mainWindow.contentView.removeChildView(tab.view);
      // Note: WebContents cleanup is handled automatically when view is removed
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

    // Hide previous WebContentsView if there was one
    if (this.activeWebContentsView) {
      this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
      this.activeWebContentsView = null;
    }

    // Show new active tab
    this.activeTabId = tabId;
    tab.lastViewed = Date.now();

    if (tab.view) {
      // Validate that the view still has webContents attached
      if (!tab.view.webContents) {
        console.warn(`Tab ${tabId} has no webContents, skipping activation`);
        this.tabs.delete(tabId);
        const remainingTabs = Array.from(this.tabs.keys());
        if (remainingTabs.length > 0) {
          return this.setActiveTab(remainingTabs[0]);
        }
        return { success: false, error: 'Tab has no webContents' };
      }

      // Check if the view's webContents has been destroyed
      if (tab.view.webContents.isDestroyed()) {
        console.warn(`Tab ${tabId} has a destroyed webContents, skipping activation`);
        // Remove the destroyed tab
        this.tabs.delete(tabId);
        // Try to activate another tab
        const remainingTabs = Array.from(this.tabs.keys());
        if (remainingTabs.length > 0) {
          return this.setActiveTab(remainingTabs[0]);
        }
        return { success: false, error: 'Tab webContents has been destroyed' };
      }

      try {
        // Traditional WebContentsView tab (webpage, notes, uploads)
        this.mainWindow.contentView.addChildView(tab.view);
        this.activeWebContentsView = tab.view;

        // Position the view to the right of the sidebar and below the header (and search bar if visible)
        const bounds = this.mainWindow.getContentBounds();
        const headerHeight = this.HEADER_HEIGHT + (this.isSearchBarVisible ? this.SEARCH_BAR_HEIGHT : 0);
        tab.view.setBounds({
          x: this.SIDEBAR_WIDTH,
          y: headerHeight,
          width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
          height: Math.max(0, bounds.height - headerHeight),
        });
      } catch (error) {
        // Handle race condition where view is destroyed between check and usage
        if (error instanceof Error && error.message.includes('destroyed')) {
          console.warn(`Tab ${tabId} was destroyed during activation`);
          // Remove the destroyed tab
          this.tabs.delete(tabId);
          // Try to activate another tab
          const remainingTabs = Array.from(this.tabs.keys());
          if (remainingTabs.length > 0) {
            return this.setActiveTab(remainingTabs[0]);
          }
          return { success: false, error: 'Tab webContents was destroyed during activation' };
        }
        throw error; // Re-throw if it's not a destroyed object error
      }
    } else {
      // Svelte component tab (LLM responses)
      // Renderer will show Svelte component in the content area
      this.activeWebContentsView = null;
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

  getLLMTabsSnapshot(): Array<{ id: string; title: string; streaming?: boolean; hasResponse: boolean; responseLength: number } > {
    return Array.from(this.tabs.values())
      .filter((tab) => tab.metadata?.isLLMResponse)
      .map((tab) => ({
        id: tab.id,
        title: tab.title,
        streaming: tab.metadata?.isStreaming,
        hasResponse: Boolean(tab.metadata?.response?.length),
        responseLength: tab.metadata?.response?.length || 0,
      }));
  }

  getTabMetadataSnapshot(tabId: string): Record<string, unknown> | null {
    const tab = this.tabs.get(tabId);
    if (!tab?.metadata) return null;

    const { response, ...rest } = tab.metadata;
    return { ...rest };
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

  focusActiveWebContents(): { success: boolean; error?: string } {
    if (!this.activeTabId) {
      return { success: false, error: 'No active tab' };
    }

    if (!this.activeWebContentsView) {
      return { success: false, error: 'Active tab has no WebContentsView' };
    }

    if (this.activeWebContentsView.webContents.isDestroyed()) {
      return { success: false, error: 'Active tab WebContentsView was destroyed' };
    }

    try {
      this.mainWindow.focus();
      this.mainWindow.webContents.focus();
      this.activeWebContentsView.webContents.focus();
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Active tab WebContentsView was destroyed during focus' };
      }
      throw error;
    }
  }

  /**
   * Extract favicon from page
   */
  private async extractFavicon(tabId: string): Promise<string | null> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return null;
    if (tab.view.webContents.isDestroyed()) return null;

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
      if (tab.view.webContents.isDestroyed()) {
        return { success: false, error: 'Tab webContents has been destroyed' };
      }

      try {
        tab.view.webContents.reload();
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes('destroyed')) {
          return { success: false, error: 'Tab webContents was destroyed' };
        }
        throw error;
      }
    }

    return { success: false, error: 'Tab view not available' };
  }

  copyTabUrl(tabId: string): { success: boolean; url?: string; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    return { success: true, url: tab.url };
  }

  getTabView(tabId: string): WebContentsView | null {
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
   * Also accumulates chunk in metadata for persistence during streaming
   */
  sendStreamChunk(tabId: string, chunk: string): void {
    const tab = this.tabs.get(tabId);
    if (tab?.metadata) {
      // Accumulate response during streaming so it's available if user navigates away/back
      tab.metadata.response = (tab.metadata.response || '') + chunk;

      // Throttled metadata updates to keep renderer store in sync during streaming
      const now = Date.now();
      const lastUpdate = this.lastMetadataUpdate.get(tabId) || 0;

      if (now - lastUpdate >= this.METADATA_UPDATE_THROTTLE_MS) {
        this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });
        this.lastMetadataUpdate.set(tabId, now);
      }
    }

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

  /**
   * Find text in the active tab's page
   */
  findInPage(tabId: string, text: string): { success: boolean; requestId?: number; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    if (!text.trim()) {
      this.stopFindInPage(tabId);
      return { success: true };
    }

    // Store the search text for findNext/findPrevious
    this.lastSearchText.set(tabId, text);

    // Increment request ID to track this search
    this.currentFindRequestId++;
    const requestId = this.currentFindRequestId;

    try {
      // Set up the found-in-page listener
      tab.view.webContents.once('found-in-page', (_event, result) => {
        // Only send if this is still the current request
        if (requestId === this.currentFindRequestId) {
          this.sendToRenderer('found-in-page', {
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches,
            requestId: requestId,
          });
        }
      });

      // Start the search
      tab.view.webContents.findInPage(text, {
        forward: true,
        findNext: false,
      });

      return { success: true, requestId };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  /**
   * Find next occurrence in the page
   */
  findNext(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    const searchText = this.lastSearchText.get(tabId);
    if (!searchText) return { success: false, error: 'No active search' };

    try {
      // Set up the found-in-page listener
      tab.view.webContents.once('found-in-page', (_event, result) => {
        this.sendToRenderer('found-in-page', {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
        });
      });

      // Find next using the stored search text
      tab.view.webContents.findInPage(searchText, {
        forward: true,
        findNext: true,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  /**
   * Find previous occurrence in the page
   */
  findPrevious(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    const searchText = this.lastSearchText.get(tabId);
    if (!searchText) return { success: false, error: 'No active search' };

    try {
      // Set up the found-in-page listener
      tab.view.webContents.once('found-in-page', (_event, result) => {
        this.sendToRenderer('found-in-page', {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
        });
      });

      // Find previous using the stored search text
      tab.view.webContents.findInPage(searchText, {
        forward: false,
        findNext: true,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  /**
   * Stop finding and clear highlights
   */
  stopFindInPage(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: true }; // Not an error, just nothing to do
    if (tab.view.webContents.isDestroyed()) return { success: true }; // Not an error, just nothing to do

    try {
      tab.view.webContents.stopFindInPage('clearSelection');
      this.lastSearchText.delete(tabId); // Clear stored search text
      this.currentFindRequestId++; // Invalidate any pending requests
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        // Clear stored search text even if webContents is destroyed
        this.lastSearchText.delete(tabId);
        this.currentFindRequestId++;
        return { success: true }; // Not an error, just nothing to do
      }
      throw error;
    }
  }
}

export default TabManager;
