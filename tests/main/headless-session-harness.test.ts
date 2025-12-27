import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => {
  class BrowserWindow {}
  class WebContentsView {}
  return {
    BrowserWindow,
    WebContentsView,
    app: { getPath: vi.fn(() => '/tmp'), on: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => false),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    },
  };
});

import { createHeadlessSessionHarness, createStubView } from './helpers/headless-session-harness.js';
import type { TabWithView } from '../../src/types.js';

describe('Headless session bootstrap helper', () => {
  it('runs a reusable bootstrap to save and restore across windows', async () => {
    const { bootstrap } = createHeadlessSessionHarness();

    const result = await bootstrap((manager, ctx) => {
      const { tabId: primaryTab } = manager.openUrl('https://primary.example');
      const { tabId: secondaryTab } = manager.openUrl('https://secondary.example', true, ctx.secondaryWindowId);

      manager.setActiveTab(primaryTab, ctx.primaryWindowId);
      manager.setActiveTab(secondaryTab, ctx.secondaryWindowId);
    });

    expect(result.restored).toBe(true);
    expect(result.saved.windows).toEqual([
      { id: 'window-1', activeTabId: result.saved.windows[0]!.activeTabId, tabIds: [result.saved.windows[0]!.tabIds[0]!] },
      { id: 'window-2', activeTabId: result.saved.windows[1]!.activeTabId, tabIds: [result.saved.windows[1]!.tabIds[0]!] },
    ]);

    const snapshots = result.registry.getWindowSnapshots();
    expect(snapshots.find((w: any) => w.id === 'window-1')?.activeTabId).toBeDefined();
    expect(snapshots.find((w: any) => w.id === 'window-2')?.activeTabId).toBeDefined();
  });

  it('restores mixed LLM, upload, and bookmark-backed tabs via the bootstrap helper', async () => {
    const { bootstrap, addManualTab, mapper } = createHeadlessSessionHarness();

    const result = await bootstrap((manager, ctx) => {
      addManualTab(manager, {
        id: 'persisted-llm',
        title: 'LLM Response',
        url: 'llm-response://1',
        type: 'notes',
        component: 'llm-response',
        metadata: { isLLMResponse: true, query: 'hello', response: 'world' },
      });

      const uploadTab: TabWithView = {
        id: 'persisted-upload',
        title: 'Upload Image',
        url: 'upload://123',
        type: 'upload',
        view: createStubView(),
        metadata: { filePath: '/tmp/image.png', fileType: 'image' },
      };
      addManualTab(manager, uploadTab, ctx.secondaryWindowId);

      const bookmarkTab: TabWithView = {
        id: 'persisted-bookmark',
        title: 'Bookmarked Note',
        url: 'note://bookmark',
        type: 'notes',
        component: 'note',
        metadata: { fileType: 'text', filePath: '/tmp/bookmark.txt', noteContent: 'cached content', noteId: 42 },
      };
      addManualTab(manager, bookmarkTab, ctx.primaryWindowId);

      const eligible = manager['sessionPersistence'].getTabsForPersistence();
      expect(eligible.length).toBe(3);
      expect(eligible.every((tab) => mapper.isPersistable(tab))).toBe(true);
    });

    expect(result.restored).toBe(true);
    expect(result.io.readBinary).toHaveBeenCalledWith('/tmp/image.png');
    expect(result.io.readText).toHaveBeenCalledWith('/tmp/bookmark.txt');
  });
});
