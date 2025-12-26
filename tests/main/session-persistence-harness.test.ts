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

import { SessionPersistenceService } from '../../src/main/tab-manager/session-persistence-service.js';
import { SessionPersistenceMapper } from '../../src/main/tab-manager/session-persistence-mapper.js';
import type { SessionPersistenceIO } from '../../src/main/tab-manager/session-persistence-service.js';
import type { TabData, TabWithView, ViewHandle } from '../../src/types.js';

const createStubView = () => {
  const view: ViewHandle = {
    webContents: {
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(),
      reload: vi.fn(),
      focus: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      send: vi.fn(),
    },
    setBounds: vi.fn(),
    getNativeView: vi.fn(),
  };
  return view;
};

function createService({
  existingTabs = new Map<string, TabWithView>(),
  ioOverrides = {},
}: {
  existingTabs?: Map<string, TabWithView>;
  ioOverrides?: Partial<SessionPersistenceIO>;
}) {
  let idCounter = 0;
  const mapper = new SessionPersistenceMapper();
  const io: SessionPersistenceIO = {
    exists: vi.fn(() => true),
    readText: vi.fn(() => 'restored text'),
    readBinary: vi.fn(() => Buffer.from('restored-bytes')),
    createView: vi.fn(() => createStubView()),
    writeTempFile: vi.fn(() => 'file://tmp/restored'),
    loadURL: vi.fn((view, url) => view.webContents.loadURL(url)),
    createFileErrorHTML: vi.fn(() => '<html>error</html>'),
    ...ioOverrides,
  };

  const deps = {
    tabs: existingTabs,
    createTabId: () => `restored-${++idCounter}`,
    getTabData: (tabId: string) => existingTabs.get(tabId) ?? null,
    sendToRenderer: vi.fn(),
    openUrl: vi.fn((url: string) => {
      const tabId = `open-${++idCounter}`;
      const tab: TabWithView = { id: tabId, url, title: 'Loading...', type: 'webpage' };
      existingTabs.set(tabId, tab);
      return { tabId, tab };
    }),
    createView: () => createStubView(),
    setTabOwner: vi.fn(),
    io,
  };

  return { service: new SessionPersistenceService(deps, mapper), mapper, deps, io, tabs: existingTabs };
}

describe('Session persistence lifecycle harness', () => {
  it('saves with pure mapper and restores via injected IO without touching fs', () => {
    const initialTabs = new Map<string, TabWithView>();
    initialTabs.set('t1', {
      id: 't1',
      title: 'Doc',
      url: 'note://doc',
      type: 'notes',
      component: 'note',
      metadata: { fileType: 'text', noteContent: 'draft', filePath: '/tmp/doc.txt' },
    });
    initialTabs.set('t2', {
      id: 't2',
      title: 'Photo',
      url: 'note://photo',
      type: 'notes',
      metadata: { fileType: 'image', filePath: '/tmp/photo.png', imageData: 'data:image/png;base64,AAA' },
    });

    const { service: savingService, mapper } = createService({ existingTabs: initialTabs });
    const persisted = savingService.getTabsForPersistence();

    expect(persisted).toHaveLength(2);
    expect(persisted.every((tab) => mapper.isPersistable(tab))).toBe(true);
    expect(persisted.find((tab) => tab.id === 't2')?.metadata?.imageData).toBeUndefined();

    const restoredTabs = new Map<string, TabWithView>();
    const { service: restoringService, io } = createService({ existingTabs: restoredTabs });

    for (const tab of persisted) {
      restoringService.restoreTab(tab);
    }

    expect(io.readText).toHaveBeenCalledWith('/tmp/doc.txt');
    expect(io.readBinary).toHaveBeenCalledWith('/tmp/photo.png');
    expect(io.writeTempFile).toHaveBeenCalled();
    expect(restoredTabs.size).toBe(2);
  });
});
