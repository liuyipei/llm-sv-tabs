import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/types';

const ipcHandlers = new Map<string, any>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, listener: any) => {
      ipcHandlers.set(channel, listener);
    }),
  },
}));

const providerMock = {
  queryStream: vi.fn(async (_messages: any, _options: any, onChunk?: (chunk: any) => void) => {
    onChunk?.({ delta: 'partial' });
    return {
      response: 'provider response',
      tokensIn: 3,
      tokensOut: 7,
      model: 'mock-model',
    };
  }),
};

vi.mock('../../src/main/providers/provider-factory.js', () => ({
  ProviderFactory: {
    getProvider: vi.fn(() => providerMock),
  },
}));

const { registerIpcHandlers } = await import('../../src/main/ipc/register-ipc-handlers.ts');

class TabManagerStub {
  tabs: Map<string, TabData>;
  metadataUpdates: Array<{ tabId: string; metadata: Record<string, any> }> = [];
  lastStreamChunk: any;
  nextLlmId = 1;

  constructor(noteTab: TabData, llmContextTab: TabData) {
    this.tabs = new Map<string, TabData>([
      [noteTab.id, noteTab],
      [llmContextTab.id, llmContextTab],
    ]);
  }

  openLLMResponseTab(query: string) {
    const tabId = `llm-new-${this.nextLlmId++}`;
    const llmTab: TabData = {
      id: tabId,
      title: 'Loading...',
      url: `llm-response://${tabId}`,
      type: 'notes',
      metadata: {
        isLLMResponse: true,
        query,
        response: '',
        isStreaming: true,
      },
    };
    this.tabs.set(tabId, llmTab);
    return { tabId, tab: llmTab };
  }

  prepareLLMTabForStreaming(_tabId: string, query: string) {
    return { success: true, query };
  }

  getTab(id: string) {
    return this.tabs.get(id) ?? null;
  }

  getTabData(id: string) {
    const tab = this.getTab(id);
    return tab ? { ...tab } : null;
  }

  getTabView() {
    return undefined;
  }

  updateLLMMetadata(tabId: string, metadata: any) {
    const tab = this.tabs.get(tabId);
    if (tab?.metadata) {
      Object.assign(tab.metadata, metadata);
      this.metadataUpdates.push({ tabId, metadata });
    }
    return { success: true };
  }

  sendStreamChunk(tabId: string, chunk: any) {
    this.lastStreamChunk = { tabId, chunk };
  }

  updateLLMResponseTab(tabId: string, response: string, metadata: any) {
    const tab = this.tabs.get(tabId);
    if (tab?.metadata) {
      tab.metadata.response = response;
      Object.assign(tab.metadata, metadata);
    }
    return { success: true };
  }

  getTabMetadataSnapshot(tabId: string) {
    const tab = this.tabs.get(tabId);
    return tab?.metadata ? { ...tab.metadata } : undefined;
  }

  getLLMTabsSnapshot() {
    return Array.from(this.tabs.values()).filter(tab => tab.metadata?.isLLMResponse);
  }

  markLLMStreamingComplete(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab?.metadata) {
      tab.metadata.isStreaming = false;
    }
  }
}

describe('registerIpcHandlers send-query', () => {
  const noteContent = 'Persisted bookmark text content';
  let tabManager: TabManagerStub;

  beforeEach(() => {
    ipcHandlers.clear();
    providerMock.queryStream.mockClear();

    const noteTab: TabData = {
      id: 'note-1',
      title: 'Bookmark',
      url: 'note://1',
      type: 'notes',
      component: 'note',
      metadata: {
        fileType: 'text',
        noteContent,
      },
    };

    const llmContextTab: TabData = {
      id: 'llm-context-1',
      title: 'Conversation',
      url: 'llm-response://context',
      type: 'notes',
      component: 'llm-response',
      metadata: {
        isLLMResponse: true,
        response: 'Earlier conversation reply',
        query: 'First turn',
        isStreaming: false,
      },
    };

    tabManager = new TabManagerStub(noteTab, llmContextTab);

    registerIpcHandlers({
      tabManager: tabManager as any,
      bookmarkManager: {} as any,
      screenshotService: {} as any,
    });
  });

  it('includes text note content in the generated fullQuery', async () => {
    const sendQueryHandler = ipcHandlers.get('send-query');
    expect(sendQueryHandler).toBeDefined();

    const response = await sendQueryHandler({}, 'What does the note say?', {
      provider: 'mock-provider',
      selectedTabIds: ['note-1'],
    });

    expect(response.fullQuery).toContain(noteContent);

    const metadataWithFullQuery = tabManager.metadataUpdates.find(
      (update) => typeof update.metadata.fullQuery === 'string'
    );
    expect(metadataWithFullQuery?.metadata.fullQuery).toContain(noteContent);

    const [messages] = providerMock.queryStream.mock.calls[0];
    const userMessage = messages.find((msg: any) => msg.role === 'user');
    expect(typeof userMessage?.content === 'string' ? userMessage.content : '').toContain(noteContent);
  });

  it('includes prior LLM conversation content when selected', async () => {
    const sendQueryHandler = ipcHandlers.get('send-query');
    expect(sendQueryHandler).toBeDefined();

    const response = await sendQueryHandler({}, 'Continue the thread?', {
      provider: 'mock-provider',
      selectedTabIds: ['llm-context-1'],
    });

    expect(response.fullQuery).toContain('Earlier conversation reply');

    const metadataWithFullQuery = tabManager.metadataUpdates.find(
      (update) => typeof update.metadata.fullQuery === 'string'
    );
    expect(metadataWithFullQuery?.metadata.fullQuery).toContain('Earlier conversation reply');

    const [messages] = providerMock.queryStream.mock.calls[providerMock.queryStream.mock.calls.length - 1];
    const userMessage = messages.find((msg: any) => msg.role === 'user');
    expect(typeof userMessage?.content === 'string' ? userMessage.content : '').toContain('Earlier conversation reply');
  });
});
