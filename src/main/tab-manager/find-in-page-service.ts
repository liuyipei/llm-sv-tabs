import type { WebContents } from 'electron';
import type { TabWithView } from '../../types';

interface FindInPageDeps {
  tabs: Map<string, TabWithView>;
  sendToRenderer: (channel: string, payload: any) => void;
}

export class FindInPageService {
  private readonly tabs: Map<string, TabWithView>;
  private readonly sendToRenderer: (channel: string, payload: any) => void;
  private currentFindRequestId = 0;
  private lastSearchText: Map<string, string> = new Map();

  constructor({ tabs, sendToRenderer }: FindInPageDeps) {
    this.tabs = tabs;
    this.sendToRenderer = sendToRenderer;
  }

  findInPage(tabId: string, text: string): { success: boolean; requestId?: number; error?: string } {
    const result = this.getSearchableTab(tabId);
    if (!result.success) return result;
    const webContents = result.webContents;
    if (!webContents) return { success: false, error: 'Tab has no web contents' };

    if (!text.trim()) {
      return this.stopFindInPage(tabId);
    }

    this.lastSearchText.set(tabId, text);
    this.currentFindRequestId++;
    const requestId = this.currentFindRequestId;

    try {
      webContents.once('found-in-page', (_event, foundResult) => {
        if (requestId === this.currentFindRequestId) {
          this.sendToRenderer('found-in-page', {
            activeMatchOrdinal: foundResult.activeMatchOrdinal,
            matches: foundResult.matches,
            requestId,
          });
        }
      });

      webContents.findInPage(text, {
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

  findNext(tabId: string): { success: boolean; error?: string } {
    const result = this.getSearchableTab(tabId);
    if (!result.success) return result;
    const webContents = result.webContents;
    if (!webContents) return { success: false, error: 'Tab has no web contents' };

    const searchText = this.lastSearchText.get(tabId);
    if (!searchText) return { success: false, error: 'No active search' };

    try {
      webContents.once('found-in-page', (_event, foundResult) => {
        this.sendToRenderer('found-in-page', {
          activeMatchOrdinal: foundResult.activeMatchOrdinal,
          matches: foundResult.matches,
        });
      });

      webContents.findInPage(searchText, {
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

  findPrevious(tabId: string): { success: boolean; error?: string } {
    const result = this.getSearchableTab(tabId);
    if (!result.success) return result;
    const webContents = result.webContents;
    if (!webContents) return { success: false, error: 'Tab has no web contents' };

    const searchText = this.lastSearchText.get(tabId);
    if (!searchText) return { success: false, error: 'No active search' };

    try {
      webContents.once('found-in-page', (_event, foundResult) => {
        this.sendToRenderer('found-in-page', {
          activeMatchOrdinal: foundResult.activeMatchOrdinal,
          matches: foundResult.matches,
        });
      });

      webContents.findInPage(searchText, {
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

  stopFindInPage(tabId: string): { success: boolean; error?: string } {
    const result = this.getSearchableTab(tabId, true);
    if (!result.success) return { success: true };
    if (!result.webContents) return { success: true };

    try {
      result.webContents.stopFindInPage('clearSelection');
      this.lastSearchText.delete(tabId);
      this.currentFindRequestId++;
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('destroyed')) {
        this.lastSearchText.delete(tabId);
        this.currentFindRequestId++;
        return { success: true };
      }
      throw error;
    }
  }

  private getSearchableTab(tabId: string, allowMissingView: boolean = false):
    | { success: true; webContents?: WebContents }
    | { success: false; error: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.view || !tab.view.webContents) {
      return allowMissingView ? { success: true } : { success: false, error: 'Tab has no web contents' };
    }
    if (tab.view.webContents.isDestroyed()) return { success: allowMissingView, error: 'Tab webContents has been destroyed' };

    return { success: true, webContents: tab.view.webContents };
  }
}
