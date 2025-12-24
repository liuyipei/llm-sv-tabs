import type { TabData, TabWithView, TabType, TabRegistrySnapshot } from '../../types.js';
import type { WindowId, WindowRegistry } from './window-registry.js';

interface AggregateTabServiceDeps {
  tabs: Map<string, TabWithView>;
  createTabId: () => string;
  getTabData: (tabId: string) => TabData | null;
  setTabOwner: (tabId: string, windowId: WindowId) => void;
  setActiveTab: (tabId: string, windowId?: WindowId) => { success: boolean; error?: string };
  sendToRenderer: (channel: string, payload: any, windowId?: WindowId) => void;
  saveSession: () => Promise<void> | void;
  windowRegistry: WindowRegistry;
  getPrimaryWindowId: () => WindowId;
}

export class AggregateTabService {
  constructor(private readonly deps: AggregateTabServiceDeps) {}

  private findAggregateTabForWindow(windowId: WindowId): TabWithView | undefined {
    return Array.from(this.deps.tabs.values()).find(
      (tab) => tab.component === 'aggregate-tabs' && this.deps.windowRegistry.getWindowIdForTab(tab.id) === windowId
    );
  }

  openAggregateTab(autoSelect: boolean = true, windowId?: WindowId): { tabId: string; tab: TabData } {
    const targetWindowId = windowId ?? this.deps.getPrimaryWindowId();
    const existing = this.findAggregateTabForWindow(targetWindowId);
    if (existing) {
      if (autoSelect) {
        this.deps.setActiveTab(existing.id, targetWindowId);
      }
      return { tabId: existing.id, tab: this.deps.getTabData(existing.id)! };
    }

    const tabId = this.deps.createTabId();
    const timestamp = Date.now();

    const tab: TabWithView = {
      id: tabId,
      title: 'All Windows',
      url: `aggregate-tabs://${targetWindowId}`,
      type: 'notes' as TabType,
      component: 'aggregate-tabs',
      created: timestamp,
      lastViewed: timestamp,
    };

    this.deps.tabs.set(tabId, tab);
    this.deps.setTabOwner(tabId, targetWindowId);

    if (autoSelect) {
      this.deps.setActiveTab(tabId, targetWindowId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, targetWindowId);
    void this.deps.saveSession();

    return { tabId, tab: this.deps.getTabData(tabId)! };
  }

  getRegistrySnapshot(): TabRegistrySnapshot {
    return {
      windows: this.deps.windowRegistry.getWindowSnapshots(),
      tabs: Array.from(this.deps.tabs.values())
        .map((tab) => this.deps.getTabData(tab.id))
        .filter((tabData): tabData is TabData => Boolean(tabData)),
    };
  }
}
