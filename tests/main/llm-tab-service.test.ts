import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMTabService } from '../../src/main/tab-manager/llm-tab-service.ts';
import type { TabData, TabWithView } from '../../src/types';

describe('LLMTabService - window routing', () => {
  const tabs = new Map<string, TabWithView>();
  let callOrder: Array<{ type: string; windowId?: string; channel?: string }>;
  const createTabId = () => `tab-${tabs.size + 1}`;

  const getTabData = (tabId: string): TabData | undefined | null => {
    const tab = tabs.get(tabId);
    return tab
      ? {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          type: tab.type,
          component: tab.component,
          metadata: tab.metadata,
        }
      : undefined;
  };

  let service: LLMTabService;

  beforeEach(() => {
    tabs.clear();
    callOrder = [];

    service = new LLMTabService({
      tabs,
      createTabId,
      getTabData,
      sendToRenderer: vi.fn((channel, _payload, windowId) => {
        callOrder.push({ type: 'send', channel, windowId });
      }),
      saveSession: vi.fn(),
      setActiveTab: vi.fn((_tabId, windowId) => {
        callOrder.push({ type: 'activate', windowId });
        return { success: true };
      }),
      setTabOwner: vi.fn((_tabId, windowId) => {
        callOrder.push({ type: 'owner', windowId });
      }),
      lastMetadataUpdate: new Map(),
      openUrl: vi.fn(),
    });
  });

  it('sets tab owner and sends creation to the provided window before notifying', () => {
    const { tabId } = service.openLLMResponseTab('hello', 'response', undefined, true, 'win-2');

    expect(callOrder.map((entry) => entry.type)).toEqual(['owner', 'activate', 'send']);
    expect(callOrder[0]).toMatchObject({ type: 'owner', windowId: 'win-2' });
    expect(callOrder[2]).toMatchObject({ type: 'send', channel: 'tab-created', windowId: 'win-2' });
    expect(tabs.get(tabId)?.metadata?.query).toBe('hello');
  });

  it('avoids activation when autoSelect is false but still routes to the window', () => {
    service.openLLMResponseTab('hello', undefined, undefined, false, 'win-secondary');

    expect(callOrder.map((entry) => entry.type)).toEqual(['owner', 'send']);
    expect(callOrder[0]).toMatchObject({ type: 'owner', windowId: 'win-secondary' });
    expect(callOrder[1]).toMatchObject({ type: 'send', channel: 'tab-created', windowId: 'win-secondary' });
  });
});
