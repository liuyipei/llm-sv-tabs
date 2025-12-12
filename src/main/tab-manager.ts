import { WebContentsView, BrowserWindow } from 'electron';
import type { TabData, TabMetadata, TabType, TabWithView } from '../types';
import { SessionManager } from './services/session-manager.js';
import { createNoteHTML } from './templates/note-template.js';
import { createDebugInfoHTML } from './templates/debug-info-template.js';
import { LLMTabService } from './tab-manager/llm-tab-service.js';
import { FindInPageService } from './tab-manager/find-in-page-service.js';
import { NavigationService } from './tab-manager/navigation-service.js';
import { createConfiguredView } from './tab-manager/web-contents-view-factory.js';

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
  private isSearchBarVisible: boolean = false; // Track search bar visibility
  private llmTabs: LLMTabService;
  private findInPageService: FindInPageService;
  private navigation: NavigationService;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.activeWebContentsView = null;
    this.tabCounter = 0;
    this.sessionManager = new SessionManager();
    this.lastMetadataUpdate = new Map();

    this.llmTabs = new LLMTabService({
      tabs: this.tabs,
      createTabId: () => this.createTabId(),
      getTabData: (tabId) => this.getTabData(tabId),
      sendToRenderer: (channel, payload) => this.sendToRenderer(channel, payload),
      saveSession: () => this.saveSession(),
      setActiveTab: (tabId) => this.setActiveTab(tabId),
      lastMetadataUpdate: this.lastMetadataUpdate,
      openUrl: (url, autoSelect) => this.openUrl(url, autoSelect),
    });

    this.findInPageService = new FindInPageService({
      tabs: this.tabs,
      sendToRenderer: (channel, payload) => this.sendToRenderer(channel, payload),
    });

    this.navigation = new NavigationService({ tabs: this.tabs });

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

  private createView(): WebContentsView {
    return createConfiguredView((url) => this.openUrl(url));
  }

  openUrl(url: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = this.createView();

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

    // Handle page load failures (network errors, DNS failures, certificate errors, etc.)
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Only handle main frame failures (not subframes like iframes)
      if (!isMainFrame) return;

      // Error code -3 is "ABORTED" which happens during normal navigation, ignore it
      if (errorCode === -3) return;

      console.error(`Tab ${tabId} failed to load: ${errorDescription} (code: ${errorCode}) for URL: ${validatedURL}`);

      // Store the error information
      tab.loadError = {
        errorCode,
        errorDescription,
      };

      // Update title to indicate failure
      if (tab.title === 'Loading...') {
        tab.title = 'Failed to load';
        this.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });
      }

      // Notify renderer about the load error
      this.sendToRenderer('tab-load-error', {
        id: tabId,
        errorCode,
        errorDescription,
        url: validatedURL,
      });
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

    // For text notes, use Svelte component (editable); for images/PDFs, use WebContentsView
    const useWebContentsView = fileType !== 'text';

    // Generate URL: for text notes, show preview of content; otherwise use note:// protocol
    const noteUrl = fileType === 'text'
      ? this.generateNoteUrl(content)
      : `note://${noteId}`;

    const tab: TabWithView = {
      id: tabId,
      title: title,
      url: noteUrl,
      type: 'notes' as TabType,
      view: useWebContentsView ? this.createView() : undefined,
      component: fileType === 'text' ? 'note' : undefined,
      created: Date.now(),
      lastViewed: Date.now(),
      metadata: {
        fileType: fileType,
        // For text notes, store content in metadata for editing
        noteContent: fileType === 'text' ? content : undefined,
        // For image tabs, store the data URL
        imageData: fileType === 'image' ? content : undefined,
        // Extract MIME type from data URL if it's an image
        mimeType: fileType === 'image' && content.startsWith('data:')
          ? content.split(';')[0].split(':')[1]
          : undefined,
      },
    };

    this.tabs.set(tabId, tab);

    // For images/PDFs, create HTML content and load in WebContentsView
    if (useWebContentsView && tab.view) {
      const htmlContent = createNoteHTML(title, content, fileType);
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
      tab.view.webContents.loadURL(dataUrl);
    }

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
   * Generate URL for note tab based on content preview
   */
  private generateNoteUrl(content: string): string {
    if (!content || content.trim().length === 0) {
      return 'note://empty';
    }
    // Get first 30 characters of content, trimmed and cleaned
    const preview = content.trim().substring(0, 30).replace(/\s+/g, ' ');
    return preview + (content.length > 30 ? '...' : '');
  }

  /**
   * Update note content and URL
   */
  updateNoteContent(tabId: string, content: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (tab.metadata?.fileType !== 'text') return { success: false, error: 'Not a text note tab' };

    // Update content in metadata
    if (tab.metadata) {
      tab.metadata.noteContent = content;
    }

    // Update URL based on content preview
    tab.url = this.generateNoteUrl(content);

    // Notify renderer of URL update
    this.sendToRenderer('tab-url-updated', { id: tabId, url: tab.url });

    return { success: true };
  }

  openLLMResponseTab(query: string, response?: string, error?: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
    return this.llmTabs.openLLMResponseTab(query, response, error, autoSelect);
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
    return this.llmTabs.updateLLMMetadata(tabId, metadata);
  }

  /**
   * Force a streaming session to finish and notify the renderer, even if
   * upstream handlers failed to send a final update.
   */
  markLLMStreamingComplete(tabId: string): void {
    this.llmTabs.markLLMStreamingComplete(tabId);
  }

  /**
   * Reset an existing LLM tab so it can be reused for a new streaming request
   */
  prepareLLMTabForStreaming(tabId: string, query: string): { success: boolean; error?: string } {
    return this.llmTabs.prepareLLMTabForStreaming(tabId, query);
  }

  updateLLMResponseTab(tabId: string, response: string, metadata?: any): { success: boolean; error?: string } {
    return this.llmTabs.updateLLMResponseTab(tabId, response, metadata);
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
    return this.llmTabs.openRawMessageViewer(tabId, autoSelect);
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
    return this.navigation.goBack(tabId);
  }

  /**
   * Navigate forward in the tab's history
   */
  goForward(tabId: string): { success: boolean; error?: string } {
    return this.navigation.goForward(tabId);
  }

  /**
   * Get navigation state for a tab (whether it can go back/forward)
   */
  getNavigationState(tabId: string): { success: boolean; canGoBack?: boolean; canGoForward?: boolean; error?: string } {
    return this.navigation.getNavigationState(tabId);
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
      created: tab.created,
      lastViewed: tab.lastViewed,
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
    return this.navigation.reloadTab(tabId);
  }

  copyTabUrl(tabId: string): { success: boolean; url?: string; error?: string } {
    return this.navigation.copyTabUrl(tabId);
  }

  getTabView(tabId: string): WebContentsView | null {
    return this.navigation.getTabView(tabId);
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
   * Persists webpages, notes, and LLM response tabs. Excludes:
   * - upload tabs (contain binary data that should be re-uploaded)
   * - api-key-instructions (ephemeral help tab)
   * - raw-message viewer tabs (can be reopened from the source LLM tab)
   */
  private saveSession(): void {
    const tabs = Array.from(this.tabs.values())
      .map((tab) => this.getTabData(tab.id)!)
      .filter((tab) => {
        // Exclude upload tabs (binary data)
        if (tab.type === 'upload') return false;
        // Exclude ephemeral helper tabs
        if (tab.component === 'api-key-instructions') return false;
        // Exclude raw message viewer (can be reopened from source tab)
        if (tab.url?.startsWith('raw-message://')) return false;
        return true;
      });
    this.sessionManager.saveSession(tabs, this.activeTabId);
  }

  /**
   * Restore session from disk
   * Handles different tab types: webpages, notes, and LLM responses
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
      const tabId = this.restoreTab(tabData);
      if (tabId) {
        restoredTabIds.push(tabId);
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
   * Restore a single tab based on its type and component
   */
  private restoreTab(tabData: TabData): string | null {
    // LLM Response tabs
    if (tabData.component === 'llm-response' && tabData.metadata?.isLLMResponse) {
      return this.restoreLLMResponseTab(tabData);
    }

    // Text note tabs
    if (tabData.component === 'note' && tabData.type === 'notes') {
      return this.restoreNoteTab(tabData);
    }

    // Regular webpage tabs
    if (tabData.type === 'webpage') {
      const { tabId } = this.openUrl(tabData.url, false);
      const tab = this.tabs.get(tabId);
      if (tab && tabData.title !== 'Loading...') {
        tab.title = tabData.title;
      }
      return tabId;
    }

    // Unknown tab type - skip
    console.warn(`Skipping unknown tab type during restore: ${tabData.type}/${tabData.component}`);
    return null;
  }

  /**
   * Restore an LLM response tab with its full metadata
   */
  private restoreLLMResponseTab(tabData: TabData): string {
    const tabId = this.createTabId();
    const metadata = tabData.metadata || {};

    const tab: TabWithView = {
      id: tabId,
      title: tabData.title,
      url: tabData.url,
      type: 'notes' as TabType,
      component: 'llm-response',
      created: tabData.created || Date.now(),
      lastViewed: tabData.lastViewed || Date.now(),
      metadata: {
        isLLMResponse: true,
        query: metadata.query,
        fullQuery: metadata.fullQuery,
        response: metadata.response,
        error: metadata.error,
        tokensIn: metadata.tokensIn,
        tokensOut: metadata.tokensOut,
        model: metadata.model,
        selectedTabIds: metadata.selectedTabIds,
        contextTabs: metadata.contextTabs,
        isStreaming: false, // Never restore as streaming
        persistentId: metadata.persistentId,
        shortId: metadata.shortId,
        slug: metadata.slug,
      },
    };

    this.tabs.set(tabId, tab);
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    return tabId;
  }

  /**
   * Restore a text note tab with its content
   */
  private restoreNoteTab(tabData: TabData): string {
    const tabId = this.createTabId();
    const metadata = tabData.metadata || {};

    const tab: TabWithView = {
      id: tabId,
      title: tabData.title,
      url: tabData.url,
      type: 'notes' as TabType,
      component: 'note',
      created: tabData.created || Date.now(),
      lastViewed: tabData.lastViewed || Date.now(),
      metadata: {
        fileType: 'text',
        noteContent: metadata.noteContent || '',
      },
    };

    this.tabs.set(tabId, tab);
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    return tabId;
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
    return this.findInPageService.findInPage(tabId, text);
  }

  /**
   * Find next occurrence in the page
   */
  findNext(tabId: string): { success: boolean; error?: string } {
    return this.findInPageService.findNext(tabId);
  }

  /**
   * Find previous occurrence in the page
   */
  findPrevious(tabId: string): { success: boolean; error?: string } {
    return this.findInPageService.findPrevious(tabId);
  }

  /**
   * Stop finding and clear highlights
   */
  stopFindInPage(tabId: string): { success: boolean; error?: string } {
    return this.findInPageService.stopFindInPage(tabId);
  }
}

export default TabManager;
