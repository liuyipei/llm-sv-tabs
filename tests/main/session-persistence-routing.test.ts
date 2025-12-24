import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionPersistenceService } from '../../src/main/tab-manager/session-persistence-service.ts';
import type { TabData, TabWithView } from '../../src/types';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
  BrowserWindow: vi.fn(),
  WebContentsView: vi.fn(),
}));

describe('SessionPersistenceService - window routing on restore', () => {
  const tabs = new Map<string, TabWithView>();
  let callOrder: Array<{ type: string; windowId?: string; channel?: string }>;
  let service: SessionPersistenceService;
  let counter = 0;

  const createTabId = () => `tab-${++counter}`;
  const getTabData = (tabId: string): TabData | null => {
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
      : null;
  };

  beforeEach(() => {
    tabs.clear();
    callOrder = [];
    counter = 0;

    service = new SessionPersistenceService({
      tabs,
      createTabId,
      getTabData,
      sendToRenderer: vi.fn((channel, _payload, windowId) => {
        callOrder.push({ type: 'send', channel, windowId });
      }),
      openUrl: vi.fn(),
      createView: vi.fn(),
      createNoteHTML: vi.fn(),
      setTabOwner: vi.fn((_tabId, windowId) => {
        callOrder.push({ type: 'owner', windowId });
      }),
    });
  });

  it('restores LLM response tabs to the specified window', () => {
    const tabData: TabData = {
      id: 'persisted-1',
      title: 'LLM Response',
      url: 'llm-response://123',
      type: 'notes',
      component: 'llm-response',
      metadata: {
        isLLMResponse: true,
        query: 'hello',
      },
    };

    const restoredId = service.restoreTab(tabData, 'win-restored');

    expect(restoredId).toBe('tab-1');
    expect(callOrder.map((entry) => entry.type)).toEqual(['owner', 'send']);
    expect(callOrder[0]).toMatchObject({ type: 'owner', windowId: 'win-restored' });
    expect(callOrder[1]).toMatchObject({ type: 'send', channel: 'tab-created', windowId: 'win-restored' });
  });

  it('restores note tabs to the specified window', () => {
    const noteTabData: TabData = {
      id: 'persisted-note',
      title: 'Note',
      url: 'note://123',
      type: 'notes',
      component: 'note',
      metadata: {
        fileType: 'text',
        noteContent: 'body',
      },
    };

    const restoredId = service.restoreTab(noteTabData, 'win-notes');

    expect(restoredId).toBe('tab-1');
    expect(callOrder.map((entry) => entry.type)).toEqual(['owner', 'send']);
    expect(callOrder[0]).toMatchObject({ type: 'owner', windowId: 'win-notes' });
    expect(callOrder[1]).toMatchObject({ type: 'send', channel: 'tab-created', windowId: 'win-notes' });
  });
});
