import { BrowserWindow, type WebContentsView } from 'electron';

export type WindowId = string;

export interface WindowContext {
  id: WindowId;
  window: BrowserWindow;
  activeTabId: string | null;
  isSearchBarVisible: boolean;
  activeWebContentsView?: WebContentsView | null;
}

export interface WindowRegistryHandlers {
  onResize?: (windowId: WindowId) => void;
  onClose?: (windowId: WindowId) => void;
}

export class WindowRegistry {
  private windows = new Map<WindowId, WindowContext>();
  private windowLookup = new WeakMap<BrowserWindow, WindowId>();
  private tabToWindow = new Map<string, WindowId>();
  private primaryWindowId: WindowId;
  private windowCounter = 0;

  constructor(primaryWindow: BrowserWindow, handlers: WindowRegistryHandlers) {
    this.primaryWindowId = this.registerWindow(primaryWindow, true, handlers);
  }

  registerWindow(window: BrowserWindow, isPrimary: boolean, handlers: WindowRegistryHandlers): WindowId {
    const windowId: WindowId = `window-${++this.windowCounter}`;
    const context: WindowContext = {
      id: windowId,
      window,
      activeTabId: null,
      isSearchBarVisible: false,
    };

    this.windows.set(windowId, context);
    this.windowLookup.set(window, windowId);

    if (handlers.onResize) {
      window.on('resize', () => handlers.onResize?.(windowId));
    }

    window.on('close', () => {
      handlers.onClose?.(windowId);
      this.windows.delete(windowId);
      if (this.primaryWindowId === windowId) {
        const fallback = Array.from(this.windows.keys())[0];
        if (fallback) this.primaryWindowId = fallback;
      }
    });

    if (isPrimary) {
      this.primaryWindowId = windowId;
    }

    return windowId;
  }

  getPrimaryWindowId(): WindowId {
    return this.primaryWindowId;
  }

  hasWindow(windowId: WindowId): boolean {
    return this.windows.has(windowId);
  }

  getWindowIdFor(window: BrowserWindow | null): WindowId {
    return (window && this.windowLookup.get(window)) || this.primaryWindowId;
  }

  getWindowContext(windowId?: WindowId): WindowContext {
    const resolvedId = windowId ?? this.primaryWindowId;
    const context = this.windows.get(resolvedId);
    if (!context) {
      throw new Error(`Window context not found for id ${resolvedId}`);
    }
    return context;
  }

  setTabOwner(tabId: string, windowId?: WindowId): void {
    this.tabToWindow.set(tabId, windowId ?? this.primaryWindowId);
  }

  removeTab(tabId: string): void {
    this.tabToWindow.delete(tabId);
  }

  getWindowIdForTab(tabId: string, fallbackWindowId?: WindowId): WindowId {
    return this.tabToWindow.get(tabId) ?? fallbackWindowId ?? this.primaryWindowId;
  }

  getTabIdsForWindow(windowId: WindowId): string[] {
    return Array.from(this.tabToWindow.entries())
      .filter(([, ownerWindowId]) => ownerWindowId === windowId)
      .map(([tabId]) => tabId);
  }

  getWindowSnapshots(): Array<{ id: WindowId; activeTabId: string | null; tabIds: string[] }> {
    return Array.from(this.windows.values()).map((context) => ({
      id: context.id,
      activeTabId: context.activeTabId,
      tabIds: this.getTabIdsForWindow(context.id),
    }));
  }

  setActiveTab(windowId: WindowId, tabId: string | null): void {
    const context = this.getWindowContext(windowId);
    context.activeTabId = tabId;
  }

  setSearchBarVisible(windowId: WindowId, visible: boolean): void {
    const context = this.getWindowContext(windowId);
    context.isSearchBarVisible = visible;
  }
}
