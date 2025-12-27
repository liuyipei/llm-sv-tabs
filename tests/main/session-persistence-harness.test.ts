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
import type { WindowHandle } from '../../src/main/tab-manager/window-view-handles.js';
import TabManager from '../../src/main/tab-manager.js';

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

class StubWindowHandle implements WindowHandle {
  constructor(private readonly width = 1200, private readonly height = 800) {}

  public resizeHandler?: () => void;
  public closeHandler?: () => void;
  public addedViews: ViewHandle[] = [];
  public removedViews: ViewHandle[] = [];

  on(event: 'resize' | 'close', listener: () => void): void {
    if (event === 'resize') this.resizeHandler = listener;
    if (event === 'close') this.closeHandler = listener;
  }

  getContentBounds(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  addChildView(view: ViewHandle): void {
    this.addedViews.push(view);
  }

  removeChildView(view: ViewHandle): void {
    this.removedViews.push(view);
  }

  show(): void {
    // no-op for tests
  }

  focus(): void {
    // no-op for tests
  }

  webContents = {
    focus: vi.fn(),
    send: vi.fn(),
  };

  getNativeWindow(): undefined {
    return undefined;
  }
}

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

  it('round-trips active tabs and tab ownership across multiple windows headlessly', async () => {
    class StubSessionManager {
      saved:
        | {
            tabs: TabData[];
            windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>;
          }
        | undefined;

      async saveSession(
        tabs: TabData[],
        windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>
      ): Promise<void> {
        this.saved = { tabs, windows };
      }

      async loadSession(): Promise<{
        tabs: TabData[];
        activeTabId: string | null;
        windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>;
        lastSaved: number;
      } | null> {
        if (!this.saved) return null;
        return {
          tabs: this.saved.tabs,
          windows: this.saved.windows,
          activeTabId: this.saved.windows[0]?.activeTabId ?? null,
          lastSaved: Date.now(),
        };
      }
    }

    const sessionManager = new StubSessionManager();
    const primaryWindow = new StubWindowHandle();
    const secondaryWindow = new StubWindowHandle();

    const createManager = () =>
      new TabManager(primaryWindow as any, {
        createSessionManager: () => sessionManager as any,
        viewFactory: () => createStubView(),
      });

    // Create a manager with two windows and persist session state
    const manager = createManager();
    const secondWindowId = manager.registerNewWindow(secondaryWindow as any);
    const { tabId: primaryTabId } = manager.openUrl('https://primary.example');
    const { tabId: secondaryTabId } = manager.openUrl('https://secondary.example', true, secondWindowId);

    manager.setActiveTab(primaryTabId); // primary window
    manager.setActiveTab(secondaryTabId, secondWindowId); // secondary window

    await (manager as any).saveSession();

    expect(sessionManager.saved?.windows).toEqual([
      { id: 'window-1', activeTabId: primaryTabId, tabIds: [primaryTabId] },
      { id: 'window-2', activeTabId: secondaryTabId, tabIds: [secondaryTabId] },
    ]);

    // Restore into a fresh manager instance
    const restoredManager = createManager();
    const restoredSecondWindowId = restoredManager.registerNewWindow(secondaryWindow as any);
    expect(restoredSecondWindowId).toBe('window-2');

    const restored = await restoredManager.restoreSession();
    expect(restored).toBe(true);

    const restoredRegistry = (restoredManager as any).windowRegistry;
    const snapshots = restoredRegistry.getWindowSnapshots();

    const primarySnapshot = snapshots.find((w: any) => w.id === 'window-1');
    const secondarySnapshot = snapshots.find((w: any) => w.id === 'window-2');

    expect(primarySnapshot?.activeTabId).toBeDefined();
    expect(secondarySnapshot?.activeTabId).toBeDefined();
    expect(restoredRegistry.getTabIdsForWindow('window-1')).toHaveLength(1);
    expect(restoredRegistry.getTabIdsForWindow('window-2')).toHaveLength(1);
  });
});
