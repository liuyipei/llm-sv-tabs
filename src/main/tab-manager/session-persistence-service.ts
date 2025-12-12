import type { TabData, TabType, TabWithView } from '../../types';

interface SessionPersistenceServiceDeps {
  tabs: Map<string, TabWithView>;
  createTabId: () => string;
  getTabData: (tabId: string) => TabData | null;
  sendToRenderer: (channel: string, payload: any) => void;
  openUrl: (url: string, autoSelect: boolean) => { tabId: string; tab: TabData };
}

/**
 * Service for session persistence - filtering tabs for save and restoring different tab types.
 *
 * Persists: webpages, notes, LLM response tabs
 * Excludes: uploads (binary), api-key-instructions (ephemeral), raw-message viewer (reopenable)
 */
export class SessionPersistenceService {
  constructor(private readonly deps: SessionPersistenceServiceDeps) {}

  /**
   * Filter tabs to get only those that should be persisted.
   * Excludes upload tabs, ephemeral helper tabs, and raw message viewers.
   */
  getTabsForPersistence(): TabData[] {
    return Array.from(this.deps.tabs.values())
      .map((tab) => this.deps.getTabData(tab.id)!)
      .filter((tab) => this.isPersistable(tab));
  }

  /**
   * Check if a tab should be persisted to session storage.
   */
  private isPersistable(tab: TabData): boolean {
    // Exclude upload tabs (binary data)
    if (tab.type === 'upload') return false;
    // Exclude ephemeral helper tabs
    if (tab.component === 'api-key-instructions') return false;
    // Exclude raw message viewer (can be reopened from source tab)
    if (tab.url?.startsWith('raw-message://')) return false;
    return true;
  }

  /**
   * Restore a single tab based on its type and component.
   * Returns the new tab ID, or null if the tab type is unknown.
   */
  restoreTab(tabData: TabData): string | null {
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
      return this.restoreWebpageTab(tabData);
    }

    // Unknown tab type - skip
    console.warn(`Skipping unknown tab type during restore: ${tabData.type}/${tabData.component}`);
    return null;
  }

  /**
   * Restore a webpage tab by reloading from URL.
   */
  private restoreWebpageTab(tabData: TabData): string {
    const { tabId } = this.deps.openUrl(tabData.url, false);
    const tab = this.deps.tabs.get(tabId);
    if (tab && tabData.title !== 'Loading...') {
      tab.title = tabData.title;
    }
    return tabId;
  }

  /**
   * Restore an LLM response tab with its full metadata.
   */
  private restoreLLMResponseTab(tabData: TabData): string {
    const tabId = this.deps.createTabId();
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

    this.deps.tabs.set(tabId, tab);
    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) });

    return tabId;
  }

  /**
   * Restore a text note tab with its content.
   */
  private restoreNoteTab(tabData: TabData): string {
    const tabId = this.deps.createTabId();
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

    this.deps.tabs.set(tabId, tab);
    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) });

    return tabId;
  }
}
