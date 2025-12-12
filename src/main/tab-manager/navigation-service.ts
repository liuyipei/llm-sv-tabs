import type { WebContents } from 'electron';
import type { TabWithView } from '../../types';

interface NavigationServiceDeps {
  tabs: Map<string, TabWithView>;
}

export class NavigationService {
  private readonly tabs: Map<string, TabWithView>;

  constructor({ tabs }: NavigationServiceDeps) {
    this.tabs = tabs;
  }

  goBack(tabId: string): { success: boolean; error?: string } {
    const result = this.getNavigableTab(tabId);
    if (!result.success) return result;

    try {
      const navigationHistory = (result.webContents as any).navigationHistory;
      if (!navigationHistory || typeof navigationHistory.goBack !== 'function' || typeof navigationHistory.canGoBack !== 'function') {
        return { success: false, error: 'Navigation history not available' };
      }

      if (navigationHistory.canGoBack()) {
        navigationHistory.goBack();
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

  goForward(tabId: string): { success: boolean; error?: string } {
    const result = this.getNavigableTab(tabId);
    if (!result.success) return result;

    try {
      const navigationHistory = (result.webContents as any).navigationHistory;
      if (!navigationHistory || typeof navigationHistory.goForward !== 'function' || typeof navigationHistory.canGoForward !== 'function') {
        return { success: false, error: 'Navigation history not available' };
      }

      if (navigationHistory.canGoForward()) {
        navigationHistory.goForward();
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

  getNavigationState(tabId: string): { success: boolean; canGoBack?: boolean; canGoForward?: boolean; error?: string } {
    const result = this.getNavigableTab(tabId);
    if (!result.success) return result;

    try {
      const navigationHistory = (result.webContents as any).navigationHistory;
      if (!navigationHistory ||
        typeof navigationHistory.canGoBack !== 'function' ||
        typeof navigationHistory.canGoForward !== 'function') {
        return { success: true, canGoBack: false, canGoForward: false };
      }

      return {
        success: true,
        canGoBack: navigationHistory.canGoBack(),
        canGoForward: navigationHistory.canGoForward(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: true, canGoBack: false, canGoForward: false };
      }
      throw error;
    }
  }

  reloadTab(tabId: string): { success: boolean; error?: string } {
    const result = this.getNavigableTab(tabId);
    if (!result.success) return result;

    try {
      result.webContents.reload();
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        return { success: false, error: 'Tab webContents was destroyed' };
      }
      throw error;
    }
  }

  copyTabUrl(tabId: string): { success: boolean; url?: string; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    return { success: true, url: tab.url };
  }

  getTabView(tabId: string) {
    const tab = this.tabs.get(tabId);
    return tab?.view ?? null;
  }

  private getNavigableTab(tabId: string):
    | { success: true; webContents: WebContents }
    | { success: false; error: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) return { success: false, error: 'Tab has no web contents' };
    if (tab.view.webContents.isDestroyed()) return { success: false, error: 'Tab webContents has been destroyed' };

    return { success: true, webContents: tab.view.webContents };
  }
}
