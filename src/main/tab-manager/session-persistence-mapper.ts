import type { TabData } from '../../types.js';

/**
 * Pure mapper that decides which tabs should be persisted and how their payloads
 * should be trimmed to make round-trip serialization deterministic.
 */
export class SessionPersistenceMapper {
  getTabsForPersistence(tabs: Map<string, TabData>): TabData[] {
    return Array.from(tabs.values())
      .filter((tab) => this.isPersistable(tab))
      .map((tab) => this.prepareTabForPersistence(tab));
  }

  isPersistable(tab: TabData): boolean {
    if (tab.type === 'upload' && !tab.metadata?.filePath) return false;
    if (tab.component === 'api-key-instructions') return false;
    if (tab.url?.startsWith('raw-message://')) return false;
    return true;
  }

  prepareTabForPersistence(tab: TabData): TabData {
    if (tab.metadata?.filePath && tab.metadata?.fileType) {
      const { imageData, noteContent, ...restMetadata } = tab.metadata;
      return {
        ...tab,
        metadata: {
          ...restMetadata,
          noteContent: tab.metadata.fileType === 'text' ? noteContent : undefined,
        },
      };
    }
    return tab;
  }

  isFileTab(tabData: TabData): boolean {
    return !!(tabData.metadata?.filePath && tabData.metadata?.fileType);
  }

  getRestoreHandler(tabData: TabData): 'llm-response' | 'file-tab' | 'note-tab' | 'webpage' | 'unknown' {
    if (tabData.component === 'llm-response' && tabData.metadata?.isLLMResponse) {
      return 'llm-response';
    }
    if (tabData.metadata?.filePath && tabData.metadata?.fileType) {
      return 'file-tab';
    }
    if (tabData.component === 'note' && tabData.type === 'notes') {
      return 'note-tab';
    }
    if (tabData.type === 'webpage') {
      return 'webpage';
    }
    return 'unknown';
  }
}
