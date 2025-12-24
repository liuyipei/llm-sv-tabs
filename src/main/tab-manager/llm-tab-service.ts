import { createRawMessageViewerHTML } from '../templates/raw-message-template.js';
import type { TabData, TabMetadata, TabWithView } from '../../types';
import type { WebContentsView } from 'electron';
import { createConfiguredView } from './web-contents-view-factory.js';
import { generateLLMTabIdentifiers } from '../utils/tab-id-generator.js';
import type { WindowId } from './window-registry.js';

interface LLMTabDependencies {
  tabs: Map<string, TabWithView>;
  createTabId: () => string;
  getTabData: (tabId: string) => TabData | undefined | null;
  sendToRenderer: (channel: string, payload: any, windowId?: WindowId) => void;
  saveSession: () => void;
  setActiveTab: (tabId: string, windowId?: WindowId) => { success: boolean; error?: string };
  setTabOwner: (tabId: string, windowId: WindowId) => void;
  lastMetadataUpdate: Map<string, number>;
  openUrl: (url: string, autoSelect?: boolean) => { tabId: string; tab: TabData };
}

export class LLMTabService {
  constructor(private readonly deps: LLMTabDependencies) {}

  openLLMResponseTab(
    query: string,
    response?: string,
    error?: string,
    autoSelect: boolean = true,
    windowId?: WindowId
  ): { tabId: string; tab: TabData } {
    const tabId = this.deps.createTabId();

    const timestamp = Date.now();
    const isLoading = !response && !error;

    const identifiers = generateLLMTabIdentifiers(query, timestamp);

    const tab: TabWithView = {
      id: tabId,
      title: error ? 'Error' : (isLoading ? 'Loading...' : 'LLM Response'),
      url: `llm-response://${timestamp}`,
      type: 'notes',
      component: 'llm-response',
      created: timestamp,
      lastViewed: timestamp,
      metadata: {
        isLLMResponse: true,
        query,
        response,
        error,
        isStreaming: isLoading,
        persistentId: identifiers.persistentId,
        shortId: identifiers.shortId,
        slug: identifiers.slug,
      },
    };

    this.deps.tabs.set(tabId, tab);

    if (windowId) {
      this.deps.setTabOwner(tabId, windowId);
    }

    if (autoSelect) {
      this.deps.setActiveTab(tabId, windowId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);
    this.deps.saveSession();

    return { tabId, tab: this.deps.getTabData(tabId)! };
  }

  updateLLMMetadata(tabId: string, metadata: Partial<TabMetadata>): { success: boolean; error?: string } {
    const tab = this.deps.tabs.get(tabId);
    if (!tab?.metadata) {
      return { success: false, error: 'Tab not found or missing metadata' };
    }

    Object.assign(tab.metadata, metadata);
    this.deps.sendToRenderer('tab-updated', { tab: this.deps.getTabData(tabId) });

    return { success: true };
  }

  markLLMStreamingComplete(tabId: string): void {
    const tab = this.deps.tabs.get(tabId);
    if (!tab) return;

    if (!tab.metadata) {
      tab.metadata = {};
    }

    tab.metadata.isStreaming = false;
    this.deps.lastMetadataUpdate.delete(tabId);
    this.deps.sendToRenderer('tab-updated', { tab: this.deps.getTabData(tabId) });
  }

  prepareLLMTabForStreaming(tabId: string, query: string): { success: boolean; error?: string } {
    const tab = this.deps.tabs.get(tabId);
    if (!tab || !tab.metadata?.isLLMResponse) {
      return { success: false, error: 'Tab not found or not an LLM response tab' };
    }

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

    tab.title = 'Loading...';

    this.deps.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });
    this.deps.sendToRenderer('tab-updated', { tab: this.deps.getTabData(tabId) });

    this.deps.lastMetadataUpdate.delete(tabId);

    this.deps.saveSession();

    return { success: true };
  }

  updateLLMResponseTab(tabId: string, response: string, metadata?: any): { success: boolean; error?: string } {
    const tab = this.deps.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    if (tab.metadata) {
      tab.metadata.response = response;
      tab.metadata.isStreaming = false;
      if (metadata) {
        Object.assign(tab.metadata, metadata);
      }
    }

    if (metadata?.error) {
      tab.title = 'Error';
    } else {
      const modelName = metadata?.model || '';
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

    this.deps.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });
    this.deps.sendToRenderer('tab-updated', { tab: this.deps.getTabData(tabId) });
    this.deps.lastMetadataUpdate.delete(tabId);
    this.deps.saveSession();

    return { success: true };
  }

  openRawMessageViewer(tabId: string, autoSelect: boolean = true): { success: boolean; error?: string } {
    const tab = this.deps.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.metadata?.isLLMResponse) return { success: false, error: 'Not an LLM response tab' };

    const rawViewId = this.deps.createTabId();
    const view: WebContentsView = createConfiguredView(this.deps.openUrl);

    const timestamp = Date.now();
    const rawTab: TabWithView = {
      id: rawViewId,
      title: 'Raw Message View',
      url: `raw-message://${timestamp}`,
      type: 'notes',
      view,
      created: timestamp,
      lastViewed: timestamp,
    };

    this.deps.tabs.set(rawViewId, rawTab);

    const htmlContent = createRawMessageViewerHTML(tab.metadata);
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    if (autoSelect) {
      this.deps.setActiveTab(rawViewId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(rawViewId) });
    this.deps.saveSession();

    return { success: true };
  }
}
