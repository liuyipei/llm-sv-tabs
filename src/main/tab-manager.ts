import { WebContentsView, BrowserWindow } from 'electron';
import type { TabData, TabMetadata, TabType, TabWithView } from '../types';
import { SessionManager } from './services/session-manager.js';
import { tempFileService } from './services/temp-file-service.js';
import { createNoteHTML } from './templates/note-template.js';
import { createDebugInfoHTML } from './templates/debug-info-template.js';
import { LLMTabService } from './tab-manager/llm-tab-service.js';
import { FindInPageService } from './tab-manager/find-in-page-service.js';
import { NavigationService } from './tab-manager/navigation-service.js';
import { SessionPersistenceService } from './tab-manager/session-persistence-service.js';
import { createConfiguredView } from './tab-manager/web-contents-view-factory.js';
import { NoteTabService } from './tab-manager/note-tab-service.js';
import { WindowRegistry, type WindowContext, type WindowId } from './tab-manager/window-registry.js';
import { AggregateTabService } from './tab-manager/aggregate-tab-service.js';
import {
  matchesInputShortcut,
  shortcutDefinitions,
  type ShortcutActionId,
} from '../shared/keyboard-shortcuts.js';

class TabManager {
  private windowRegistry: WindowRegistry;
  private tabs: Map<string, TabWithView>;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 350;
  private readonly HEADER_HEIGHT = 53;
  private readonly SEARCH_BAR_HEIGHT = 45; // Height of the search bar when visible
  private lastMetadataUpdate: Map<string, number>; // Track last metadata update time per tab
  private readonly METADATA_UPDATE_THROTTLE_MS = 500; // Send metadata updates at most every 500ms
  private abortControllers: Map<string, AbortController>; // Track active LLM streams for cancellation
  private llmTabs: LLMTabService;
  private findInPageService: FindInPageService;
  private navigation: NavigationService;
  private sessionPersistence: SessionPersistenceService;
  private noteTabs: NoteTabService;
  private aggregateTabs: AggregateTabService;
  private openUrlInNewWindowCallback: ((url: string) => Promise<void>) | null = null;
  private openNewWindowCallback: (() => Promise<void>) | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.windowRegistry = new WindowRegistry(mainWindow, {
      onResize: (windowId) => this.updateWebContentsViewBounds(windowId),
      onClose: (windowId) => this.handleWindowClosed(windowId),
    });
    this.tabs = new Map();
    this.tabCounter = 0;
    this.sessionManager = new SessionManager();
    this.lastMetadataUpdate = new Map();
    this.abortControllers = new Map();

    this.llmTabs = new LLMTabService({
      tabs: this.tabs,
      createTabId: () => this.createTabId(),
      getTabData: (tabId) => this.getTabData(tabId),
      sendToRenderer: (channel, payload, windowId) => this.sendToRenderer(channel, payload, windowId),
      saveSession: () => this.saveSession(),
      setActiveTab: (tabId, windowId) => this.setActiveTab(tabId, windowId),
      setTabOwner: (tabId, windowId) => this.windowRegistry.setTabOwner(tabId, windowId),
      lastMetadataUpdate: this.lastMetadataUpdate,
      openUrl: (url, autoSelect) => this.openUrl(url, autoSelect),
    });

    this.findInPageService = new FindInPageService({
      tabs: this.tabs,
      sendToRenderer: (channel, payload) => this.sendToRenderer(channel, payload),
    });

    this.navigation = new NavigationService({ tabs: this.tabs });

    this.sessionPersistence = new SessionPersistenceService({
      tabs: this.tabs,
      createTabId: () => this.createTabId(),
      getTabData: (tabId) => this.getTabData(tabId),
      sendToRenderer: (channel, payload, windowId) => this.sendToRenderer(channel, payload, windowId),
      openUrl: (url, autoSelect, targetWindowId) => this.openUrl(url, autoSelect, targetWindowId),
      createView: (targetWindowId) => this.createView(targetWindowId),
      createNoteHTML: (title, content, fileType) => createNoteHTML(title, content, fileType as 'text' | 'pdf' | 'image'),
      setTabOwner: (tabId, windowId) => this.windowRegistry.setTabOwner(tabId, windowId),
    });

    this.noteTabs = new NoteTabService({
      tabs: this.tabs,
      createTabId: () => this.createTabId(),
      getTabData: (tabId) => this.getTabData(tabId),
      sendToRenderer: (channel, payload) => this.sendToRenderer(channel, payload),
      saveSession: () => this.saveSession(),
      setActiveTab: (tabId, windowId) => this.setActiveTab(tabId, windowId),
      createView: (windowId) => this.createView(windowId),
    });

    this.aggregateTabs = new AggregateTabService({
      tabs: this.tabs,
      createTabId: () => this.createTabId(),
      getTabData: (tabId) => this.getTabData(tabId),
      setTabOwner: (tabId, windowId) => this.windowRegistry.setTabOwner(tabId, windowId),
      setActiveTab: (tabId, windowId) => this.setActiveTab(tabId, windowId),
      sendToRenderer: (channel, payload, windowId) => this.sendToRenderer(channel, payload, windowId),
      saveSession: () => this.saveSession(),
      windowRegistry: this.windowRegistry,
      getPrimaryWindowId: () => this.windowRegistry.getPrimaryWindowId(),
    });

    // Save session periodically (every 30 seconds)
    setInterval(() => void this.saveSession(), 30000);
  }

  private handleWindowClosed(windowId: WindowId): void {
    const context = this.windowRegistry.getWindowContext(windowId);
    if (!context) return;

    // Clean up tab ownership for this window
    for (const tabId of this.windowRegistry.getTabIdsForWindow(windowId)) {
      this.windowRegistry.removeTab(tabId);
    }

    // Detach active view if present
    const activeView = (context as WindowContext & { activeWebContentsView?: WebContentsView }).activeWebContentsView;
    if (activeView) {
      try {
        context.window.contentView.removeChildView(activeView);
      } catch (error) {
        console.warn(`Failed to remove view during window close for ${windowId}`, error);
      }
    }
  }

  private updateWebContentsViewBounds(windowId?: WindowId): void {
    const context = this.windowRegistry.getWindowContext(windowId);
    if (!context.activeTabId) return;

    const tab = this.tabs.get(context.activeTabId);
    if (!tab || !tab.view) return;

    // Check if the view's webContents has been destroyed
      if (tab.view.webContents.isDestroyed()) {
        console.warn(`Tab ${context.activeTabId} has a destroyed webContents, skipping bounds update`);
        return;
      }

    try {
      const bounds = context.window.getContentBounds();
      const headerHeight = this.HEADER_HEIGHT + (context.isSearchBarVisible ? this.SEARCH_BAR_HEIGHT : 0);
      tab.view.setBounds({
        x: this.SIDEBAR_WIDTH,
        y: headerHeight,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
        height: Math.max(0, bounds.height - headerHeight),
      });
    } catch (error) {
      // Handle race condition where view is destroyed between check and usage
      if (error instanceof Error && error.message.includes('destroyed')) {
        console.warn(`Tab ${context.activeTabId} was destroyed during bounds update`);
      } else {
        throw error; // Re-throw if it's not a destroyed object error
      }
    }
  }

  /**
   * Set whether the search bar is visible (affects WebContentsView bounds)
   */
  setSearchBarVisible(visible: boolean, windowId?: WindowId): void {
    const context = this.windowRegistry.getWindowContext(windowId);
    this.windowRegistry.setSearchBarVisible(context.id, visible);
    this.updateWebContentsViewBounds(context.id);
  }

  private createTabId(): string {
    return `tab-${++this.tabCounter}`;
  }

  private getWindowIdForTab(tabId: string, fallbackWindowId?: WindowId): WindowId {
    return this.windowRegistry.getWindowIdForTab(tabId, fallbackWindowId);
  }

  getWindowIdFor(window: BrowserWindow | null): WindowId {
    return this.windowRegistry.getWindowIdFor(window);
  }

  private getTabIdsForWindow(windowId: WindowId): string[] {
    return this.windowRegistry.getTabIdsForWindow(windowId);
  }

  private createView(windowId?: WindowId): WebContentsView {
    const openUrlInNewWindow = this.openUrlInNewWindowCallback
      ? (url: string) => {
          this.openUrlInNewWindowCallback!(url);
        }
      : undefined;
    const view = createConfiguredView((url) => this.openUrl(url, true, windowId), openUrlInNewWindow);
    this.setupViewKeyboardShortcuts(view, windowId);
    return view;
  }

  /**
   * Set up keyboard shortcut handlers for a WebContentsView.
   * These handlers intercept keyboard events before they reach the page,
   * allowing shortcuts to work when the browser content is focused.
   */
  private setupViewKeyboardShortcuts(view: WebContentsView, windowId?: WindowId): void {
    const platform = process.platform;

    const handlers: Record<ShortcutActionId, () => void> = {
      focusUrlInput: () => this.sendFocusEvent('focus-url-bar', windowId),
      focusUrlInputFromNewTab: () => this.sendFocusEvent('focus-url-bar', windowId),
      focusLLMInput: () => this.sendFocusEvent('focus-llm-input', windowId),
      closeActiveTab: () => {
        const activeTabId = this.getActiveTabs(windowId).activeTabId;
        if (activeTabId) {
          this.closeTab(activeTabId);
        }
      },
      bookmarkActiveTab: () => this.sendFocusEvent('bookmark-tab', windowId),
      toggleSearchBar: () => this.sendFocusEvent('focus-search-bar', windowId),
      reloadActiveTab: () => {
        const activeTabId = this.getActiveTabs(windowId).activeTabId;
        if (activeTabId) {
          this.reloadTab(activeTabId);
        }
      },
      triggerScreenshot: () => {
        const targetWindow = this.windowRegistry.getWindowContext(windowId).window;
        targetWindow.webContents.send('trigger-screenshot');
      },
      goBack: () => {
        const activeTabId = this.getActiveTabs(windowId).activeTabId;
        if (activeTabId) {
          this.goBack(activeTabId);
        }
      },
      goForward: () => {
        const activeTabId = this.getActiveTabs(windowId).activeTabId;
        if (activeTabId) {
          this.goForward(activeTabId);
        }
      },
      nextTab: () => {
        const targetWindow = this.windowRegistry.getWindowContext(windowId).window;
        targetWindow.webContents.send('navigate-next-tab');
      },
      previousTab: () => {
        const targetWindow = this.windowRegistry.getWindowContext(windowId).window;
        targetWindow.webContents.send('navigate-previous-tab');
      },
      openNewWindow: () => {
        if (this.openNewWindowCallback) {
          void this.openNewWindowCallback();
        }
      },
    };

    view.webContents.on('before-input-event', (event, input) => {
      const matched = shortcutDefinitions.find((definition) =>
        matchesInputShortcut(input, definition, platform)
      );

      if (!matched) return;

      const handler = handlers[matched.id];
      if (!handler) return;

      event.preventDefault();
      handler();
    });
  }

  /**
   * Helper to send focus events to the renderer with proper focus chain.
   * Focuses the OS window and UI webContents before sending the IPC event.
   */
  private sendFocusEvent(eventName: string, windowId?: WindowId): void {
    const context = this.windowRegistry.getWindowContext(windowId);
    context.window.show();
    context.window.focus();
    context.window.webContents.focus();
    setTimeout(() => {
      context.window.webContents.send(eventName);
    }, 10);
  }

  openUrl(url: string, autoSelect: boolean = true, windowId?: WindowId): { tabId: string; tab: TabData } {
    const context = this.windowRegistry.getWindowContext(windowId);
    const tabId = this.createTabId();

    const view = this.createView(context.id);

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
    this.windowRegistry.setTabOwner(tabId, context.id);

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
      this.sendNavigationState(tabId);
    });

    view.webContents.on('did-navigate-in-page', () => {
      this.sendNavigationState(tabId);
    });

    // Extract favicon when page finishes loading
    view.webContents.on('did-finish-load', async () => {
      const favicon = await this.extractFavicon(tabId);
      if (favicon) {
        tab.favicon = favicon;
        this.sendToRenderer('tab-favicon-updated', { id: tabId, favicon });
      }

      this.sendNavigationState(tabId);
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

    this.sendNavigationState(tabId);

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(tabId, context.id);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) }, context.id);

    // Save session after tab change
    void this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openNoteTab(noteId: number, title: string, content: string, fileType: 'text' | 'pdf' | 'image' = 'text', autoSelect: boolean = true, filePath?: string, windowId?: WindowId): { tabId: string; tab: TabData } {
    const result = this.noteTabs.openNoteTab(noteId, title, content, fileType, autoSelect, filePath, windowId);
    const targetWindowId = windowId ?? this.windowRegistry.getPrimaryWindowId();
    this.windowRegistry.setTabOwner(result.tabId, targetWindowId);
    if (autoSelect) {
      this.setActiveTab(result.tabId, targetWindowId);
    }
    return result;
  }

  /**
   * Open a file from a bookmark by reading it from disk.
   * Similar to session persistence restore, but for bookmarks.
   */
  openFileFromBookmark(title: string, filePath: string, fileType: 'text' | 'pdf' | 'image', noteId?: number, windowId?: WindowId): { success: boolean; data?: { tabId: string; tab: TabData }; error?: string } {
    const result = this.noteTabs.openFileFromBookmark(title, filePath, fileType, noteId, windowId);
    if (result.success && result.data) {
      const targetWindowId = windowId ?? this.windowRegistry.getPrimaryWindowId();
      this.windowRegistry.setTabOwner(result.data.tabId, targetWindowId);
      this.setActiveTab(result.data.tabId, targetWindowId);
    }
    return result;
  }

  /**
   * Update note content and URL
   */
  updateNoteContent(tabId: string, content: string): { success: boolean; error?: string } {
    return this.noteTabs.updateNoteContent(tabId, content);
  }

  openLLMResponseTab(query: string, response?: string, error?: string, autoSelect: boolean = true, windowId?: WindowId): { tabId: string; tab: TabData } {
    const targetWindowId = windowId ?? this.windowRegistry.getPrimaryWindowId();
    return this.llmTabs.openLLMResponseTab(query, response, error, autoSelect, targetWindowId);
  }

  openApiKeyInstructionsTab(autoSelect: boolean = true, windowId?: WindowId): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();
    const timestamp = Date.now();
    const targetWindowId = windowId ?? this.windowRegistry.getPrimaryWindowId();

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
    this.windowRegistry.setTabOwner(tabId, targetWindowId);

    // Set as active tab (if autoSelect is true)
    if (autoSelect) {
      this.setActiveTab(tabId, targetWindowId);
    }

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) }, targetWindowId);

    // Save session after tab change
    void this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openAggregateTab(autoSelect: boolean = true, windowId?: WindowId): { tabId: string; tab: TabData } {
    return this.aggregateTabs.openAggregateTab(autoSelect, windowId);
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
    void this.saveSession();

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
  nextTab(windowId?: WindowId): { success: boolean; tabId?: string; error?: string } {
    const context = this.windowRegistry.getWindowContext(windowId);
    const tabIds = this.windowRegistry.getTabIdsForWindow(context.id);
    if (tabIds.length === 0) return { success: false, error: 'No tabs available' };
    if (!context.activeTabId) return { success: false, error: 'No active tab' };

    const currentIndex = tabIds.indexOf(context.activeTabId);
    const nextIndex = (currentIndex + 1) % tabIds.length;
    const nextTabId = tabIds[nextIndex];

    this.setActiveTab(nextTabId, context.id);
    return { success: true, tabId: nextTabId };
  }

  /**
   * Switch to the previous tab
   */
  previousTab(windowId?: WindowId): { success: boolean; tabId?: string; error?: string } {
    const context = this.windowRegistry.getWindowContext(windowId);
    const tabIds = this.windowRegistry.getTabIdsForWindow(context.id);
    if (tabIds.length === 0) return { success: false, error: 'No tabs available' };
    if (!context.activeTabId) return { success: false, error: 'No active tab' };

    const currentIndex = tabIds.indexOf(context.activeTabId);
    const previousIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
    const previousTabId = tabIds[previousIndex];

    this.setActiveTab(previousTabId, context.id);
    return { success: true, tabId: previousTabId };
  }

  closeTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    const context = this.windowRegistry.getWindowContext(this.windowRegistry.getWindowIdForTab(tabId));

    // Abort any active LLM stream for this tab
    const controller = this.abortControllers.get(tabId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(tabId);
    }

    // Destroy the view
    if (tab.view) {
      try {
        // Remove all event listeners before destroying view
        tab.view.webContents.removeAllListeners();
        context.window.contentView.removeChildView(tab.view);
      } catch (error) {
        console.warn(`Failed to remove view for tab ${tabId} during close`, error);
      }
      // Note: WebContents cleanup is handled automatically when view is removed
      // The destroy() method was removed in newer Electron versions
    }

    // Clean up any temp files associated with this tab (PDFs/images)
    tempFileService.cleanupForTab(tabId);

    // Remove from tabs
    this.tabs.delete(tabId);
    this.windowRegistry.removeTab(tabId);

    // If this was the active tab, switch to another in the same window
    if (context.activeTabId === tabId) {
      const remainingTabs = this.windowRegistry.getTabIdsForWindow(context.id);
      const next = remainingTabs.length > 0 ? remainingTabs[0] : null;
      this.windowRegistry.setActiveTab(context.id, next);
      if (next) {
        this.setActiveTab(next, context.id);
      }
    }

    // Notify renderer
    this.sendToRenderer('tab-closed', { id: tabId }, context.id);

    // Save session after tab change
    void this.saveSession();

    return { success: true };
  }

  setActiveTab(tabId: string, windowId?: WindowId): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    const context = this.windowRegistry.getWindowContext(this.windowRegistry.getWindowIdForTab(tabId, windowId));
    this.windowRegistry.setTabOwner(tabId, context.id);

    // Hide previous WebContentsView if there was one
    const activeView = (context as WindowContext & { activeWebContentsView?: WebContentsView }).activeWebContentsView;
    if (activeView) {
      try {
        context.window.contentView.removeChildView(activeView);
      } catch (error) {
        console.warn(`Failed to remove previous view during activation for window ${context.id}`, error);
      }
      (context as WindowContext & { activeWebContentsView?: WebContentsView }).activeWebContentsView = undefined;
    }

    // Show new active tab
    this.windowRegistry.setActiveTab(context.id, tabId);
    tab.lastViewed = Date.now();

    if (tab.view) {
      // Validate that the view still has webContents attached
      if (!tab.view.webContents) {
        console.warn(`Tab ${tabId} has no webContents, skipping activation`);
        this.tabs.delete(tabId);
        const remainingTabs = this.getTabIdsForWindow(context.id);
        if (remainingTabs.length > 0) {
          return this.setActiveTab(remainingTabs[0], context.id);
        }
        return { success: false, error: 'Tab has no webContents' };
      }

      // Check if the view's webContents has been destroyed
      if (tab.view.webContents.isDestroyed()) {
        console.warn(`Tab ${tabId} has a destroyed webContents, skipping activation`);
        // Remove the destroyed tab
        this.tabs.delete(tabId);
        // Try to activate another tab
        const remainingTabs = this.getTabIdsForWindow(context.id);
        if (remainingTabs.length > 0) {
          return this.setActiveTab(remainingTabs[0], context.id);
        }
        return { success: false, error: 'Tab webContents has been destroyed' };
      }

      try {
        // Traditional WebContentsView tab (webpage, notes, uploads)
        context.window.contentView.addChildView(tab.view);
        (context as WindowContext & { activeWebContentsView?: WebContentsView }).activeWebContentsView = tab.view;

        // Position the view to the right of the sidebar and below the header (and search bar if visible)
        const bounds = context.window.getContentBounds();
        const headerHeight = this.HEADER_HEIGHT + (context.isSearchBarVisible ? this.SEARCH_BAR_HEIGHT : 0);
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
          const remainingTabs = this.getTabIdsForWindow(context.id);
          if (remainingTabs.length > 0) {
            return this.setActiveTab(remainingTabs[0], context.id);
          }
          return { success: false, error: 'Tab webContents was destroyed during activation' };
        }
        throw error; // Re-throw if it's not a destroyed object error
      }
    } else {
      // Svelte component tab (LLM responses)
      // Renderer will show Svelte component in the content area
      (context as WindowContext & { activeWebContentsView?: WebContentsView }).activeWebContentsView = undefined;
    }

    // Notify renderer
    this.sendToRenderer('active-tab-changed', { id: tabId }, context.id);

    this.sendNavigationState(tabId);

    return { success: true };
  }

  getActiveTabs(windowId?: WindowId): { tabs: TabData[]; activeTabId: string | null } {
    const context = this.windowRegistry.getWindowContext(windowId);
    const tabs = this.windowRegistry.getTabIdsForWindow(context.id)
      .map((tabId) => this.getTabData(tabId))
      .filter((tabData): tabData is TabData => Boolean(tabData));
    return {
      tabs,
      activeTabId: context.activeTabId,
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

  getRegistrySnapshot() {
    return this.aggregateTabs.getRegistrySnapshot();
  }

  focusActiveWebContents(windowId?: WindowId): { success: boolean; error?: string } {
    const context = this.windowRegistry.getWindowContext(windowId);
    if (!context.activeTabId) {
      return { success: false, error: 'No active tab' };
    }

    if (!context.activeWebContentsView) {
      return { success: false, error: 'Active tab has no WebContentsView' };
    }

    if (context.activeWebContentsView.webContents.isDestroyed()) {
      return { success: false, error: 'Active tab WebContentsView was destroyed' };
    }

    try {
      context.window.focus();
      context.window.webContents.focus();
      context.activeWebContentsView.webContents.focus();
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

    // Skip favicon extraction for non-HTTP URLs (note://, data:, etc.)
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      return null;
    }

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

  private inferWindowIdFromPayload(payload: any): WindowId {
    const candidate = payload?.id ?? payload?.tabId ?? payload?.tab?.id;
    if (typeof candidate === 'string') {
      return this.windowRegistry.getWindowIdForTab(candidate);
    }
    return this.windowRegistry.getPrimaryWindowId();
  }

  private sendToRenderer(channel: string, data: any, windowId?: WindowId): void {
    const targetWindowId = windowId ?? this.inferWindowIdFromPayload(data);
    const context = this.windowRegistry.getWindowContext(targetWindowId);
    context.window.webContents.send(channel, data);
  }

  /**
   * Register an AbortController for a tab's LLM stream
   */
  registerAbortController(tabId: string, controller: AbortController): void {
    this.abortControllers.set(tabId, controller);
  }

  /**
   * Get the AbortController for a tab's LLM stream (if any)
   */
  getAbortController(tabId: string): AbortController | undefined {
    return this.abortControllers.get(tabId);
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

    this.sendToRenderer('llm-stream-chunk', { tabId, chunk });
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
  private async saveSession(): Promise<void> {
    const tabs = this.sessionPersistence.getTabsForPersistence();
    const windows = this.windowRegistry.getWindowSnapshots();
    try {
      await this.sessionManager.saveSession(tabs, windows);
    } catch (error) {
      console.error('Failed to persist session', error);
    }
  }

  /**
   * Restore session from disk
   */
  async restoreSession(): Promise<boolean> {
    const session = await this.sessionManager.loadSession();
    if (!session || session.tabs.length === 0) {
      return false;
    }

    const sessionTabToWindow = new Map<string, WindowId>();
    if (session.windows?.length) {
      for (const window of session.windows) {
        for (const tabId of window.tabIds) {
          sessionTabToWindow.set(tabId, window.id);
        }
      }
    }

    // Track the new tab IDs as we restore
    const restoredTabIds: string[] = [];
    const restoredTabIdMap = new Map<string, string>(); // persisted -> new
    const restoredByWindow = new Map<WindowId, string[]>();

    // Restore each tab without auto-selecting
    for (const tabData of session.tabs) {
      const savedWindowId = sessionTabToWindow.get(tabData.id);
      // Verify the saved window still exists; fall back to primary window if not
      const targetWindowId = (savedWindowId && this.windowRegistry.hasWindow(savedWindowId))
        ? savedWindowId
        : this.windowRegistry.getPrimaryWindowId();
      const tabId = this.sessionPersistence.restoreTab(tabData, targetWindowId);
      if (tabId) {
        restoredTabIds.push(tabId);
        restoredTabIdMap.set(tabData.id, tabId);
        const actualWindowId = targetWindowId;
        this.windowRegistry.setTabOwner(tabId, actualWindowId);
        const bucket = restoredByWindow.get(actualWindowId) ?? [];
        bucket.push(tabId);
        restoredByWindow.set(actualWindowId, bucket);
      }
    }

    // Determine active tab per window (fallback to legacy single activeTabId)
    const activeTargets = new Map<WindowId, string | null>();
    const primaryWindowId = this.windowRegistry.getPrimaryWindowId();
    if (session.windows?.length) {
      for (const window of session.windows) {
        // Skip windows that no longer exist (tabs were migrated to primary window)
        if (!this.windowRegistry.hasWindow(window.id)) {
          continue;
        }
        const restoredActive = window.activeTabId ? restoredTabIdMap.get(window.activeTabId) ?? null : null;
        const fallbackTab = restoredByWindow.get(window.id)?.[0] ?? null;
        activeTargets.set(window.id, restoredActive ?? fallbackTab ?? null);
      }
      // If all saved windows were from previous session, ensure primary window gets an active tab
      if (!activeTargets.has(primaryWindowId) && restoredTabIds.length > 0) {
        activeTargets.set(primaryWindowId, restoredTabIds[0]);
      }
    } else {
      const activeTabIndex = session.activeTabId
        ? session.tabs.findIndex(tab => tab.id === session.activeTabId)
        : -1;
      const activeTabId =
        activeTabIndex >= 0 && activeTabIndex < restoredTabIds.length
          ? restoredTabIds[activeTabIndex]
          : restoredTabIds[0];
      activeTargets.set(primaryWindowId, activeTabId ?? null);
    }

    // Activate tabs per window
    for (const [windowId, tabId] of activeTargets.entries()) {
      if (tabId) {
        this.setActiveTab(tabId, windowId);
      }
    }

    return true;
  }

  /**
   * Clear saved session
   */
  async clearSession(): Promise<void> {
    await this.sessionManager.clearSession();
  }

  private sendNavigationState(tabId: string): void {
    const state = this.navigation.getNavigationState(tabId);
    const windowId = this.getWindowIdForTab(tabId);
    if (!state.success) {
      this.sendToRenderer(
        'navigation-state-updated',
        {
          id: tabId,
          canGoBack: false,
          canGoForward: false,
        },
        windowId
      );
      return;
    }

    this.sendToRenderer(
      'navigation-state-updated',
      {
        id: tabId,
        canGoBack: state.canGoBack ?? false,
        canGoForward: state.canGoForward ?? false,
      },
      windowId
    );
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

  /**
   * Register a new browser window with the tab manager.
   * This allows the window to have its own set of tabs.
   * @param window The BrowserWindow to register
   * @param isPrimary Whether this should become the primary window
   * @returns The window ID for the registered window
   */
  registerNewWindow(window: BrowserWindow, isPrimary: boolean = false): string {
    const windowId = this.windowRegistry.registerWindow(window, isPrimary, {
      onResize: (wId) => this.updateWebContentsViewBounds(wId),
      onClose: (wId) => this.handleWindowClosed(wId),
    });
    return windowId;
  }

  /**
   * Open a URL in a new window.
   * Creates a tab in the specified window with the given URL.
   * @param url The URL to open
   * @param windowId The window ID to open the URL in
   * @returns The tab ID and tab data
   */
  openUrlInWindow(url: string, windowId: string): { tabId: string; tab: TabData } {
    return this.openUrl(url, true, windowId);
  }

  /**
   * Set the callback for opening URLs in new windows.
   * This is used by the web-contents-view-factory for context menus and shift+click.
   * @param callback The function to call when a URL should be opened in a new window
   */
  setOpenUrlInNewWindowCallback(callback: (url: string) => Promise<void>): void {
    this.openUrlInNewWindowCallback = callback;
  }

  /**
   * Set the callback for opening a blank new window.
   * This is used by the Ctrl+N keyboard shortcut handler.
   * @param callback The function to call when a new window should be opened
   */
  setOpenNewWindowCallback(callback: () => Promise<void>): void {
    this.openNewWindowCallback = callback;
  }
}

export default TabManager;
