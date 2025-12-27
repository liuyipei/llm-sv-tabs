import { vi } from 'vitest';
import TabManager from '../../../src/main/tab-manager.js';
import { SessionPersistenceMapper } from '../../../src/main/tab-manager/session-persistence-mapper.js';
import { SessionPersistenceService, type SessionPersistenceIO } from '../../../src/main/tab-manager/session-persistence-service.js';
import type { TabData, TabWithView, ViewHandle } from '../../../src/types.js';
import type { WindowHandle } from '../../../src/main/tab-manager/window-view-handles.js';

export class StubWindowHandle implements WindowHandle {
  resizeHandler?: () => void;
  closeHandler?: () => void;

  addChildView = vi.fn();
  removeChildView = vi.fn();
  getContentBounds = vi.fn(() => ({ width: 1200, height: 800 }));
  show = vi.fn();
  focus = vi.fn();

  webContents = {
    focus: vi.fn(),
    send: vi.fn(),
  };

  on(event: 'resize' | 'close', listener: () => void): void {
    if (event === 'resize') this.resizeHandler = listener;
    if (event === 'close') this.closeHandler = listener;
  }

  triggerResize(): void {
    this.resizeHandler?.();
  }

  triggerClose(): void {
    this.closeHandler?.();
  }

  getNativeWindow(): undefined {
    return undefined;
  }
}

export const createStubView = (): ViewHandle => ({
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
});

export const createStubIO = (overrides: Partial<SessionPersistenceIO> = {}): SessionPersistenceIO => ({
  exists: vi.fn(() => true),
  readText: vi.fn(() => 'restored text'),
  readBinary: vi.fn(() => Buffer.from('restored-binary')),
  createView: vi.fn(() => createStubView()),
  writeTempFile: vi.fn((_tabId: string, _content: string, fileType: 'pdf' | 'image') => `file://temp/${fileType}`),
  loadURL: vi.fn((view: ViewHandle, url: string) => view.webContents.loadURL(url)),
  createFileErrorHTML: vi.fn((title: string, error: string, path: string) => `<html>${title}:${error}:${path}</html>`),
  ...overrides,
});

class StubSessionManager {
  saved:
    | {
        tabs: TabData[];
        windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>;
      }
    | undefined;

  async saveSession(tabs: TabData[], windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>): Promise<void> {
    this.saved = { tabs, windows };
  }

  async loadSession(): Promise<
    | {
        tabs: TabData[];
        activeTabId: string | null;
        windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>;
        lastSaved: number;
      }
    | null
  > {
    if (!this.saved) return null;
    return {
      tabs: this.saved.tabs,
      windows: this.saved.windows,
      activeTabId: this.saved.windows[0]?.activeTabId ?? null,
      lastSaved: Date.now(),
    };
  }

  async clearSession(): Promise<void> {
    this.saved = undefined;
  }
}

export interface BootstrapContext {
  primaryWindowId: string;
  secondaryWindowId: string;
}

export interface BootstrapResult {
  restored: boolean;
  saved: NonNullable<StubSessionManager['saved']>;
  registry: any;
  restoredManager: TabManager;
  io: SessionPersistenceIO;
}

export const createHeadlessSessionHarness = (ioOverrides: Partial<SessionPersistenceIO> = {}) => {
  const sessionManager = new StubSessionManager();
  const primaryWindow = new StubWindowHandle();
  const secondaryWindow = new StubWindowHandle();
  const mapper = new SessionPersistenceMapper();
  const io = createStubIO(ioOverrides);

  const createSessionPersistence = (deps: ConstructorParameters<typeof SessionPersistenceService>[0]) =>
    new SessionPersistenceService({ ...deps, io }, mapper);

  const createManager = () =>
    new TabManager(primaryWindow as any, {
      createSessionManager: () => sessionManager as any,
      viewFactory: () => createStubView(),
      services: { createSessionPersistence },
    });

  const addManualTab = (manager: TabManager, tab: TabWithView, windowId?: string): string => {
    const target = windowId ?? (manager as any).windowRegistry.getPrimaryWindowId();
    (manager as any).tabs.set(tab.id, tab);
    (manager as any).windowRegistry.setTabOwner(tab.id, target);
    return tab.id;
  };

  const bootstrap = async (
    operate: (manager: TabManager, ctx: BootstrapContext) => Promise<void> | void
  ): Promise<BootstrapResult> => {
    const manager = createManager();
    const secondaryWindowId = manager.registerNewWindow(secondaryWindow as any);

    await operate(manager, { primaryWindowId: 'window-1', secondaryWindowId });

    await (manager as any).saveSession();

    const restoredManager = createManager();
    restoredManager.registerNewWindow(secondaryWindow as any);
    const restored = await restoredManager.restoreSession();
    const registry = (restoredManager as any).windowRegistry;

    return {
      restored,
      saved: sessionManager.saved!,
      registry,
      restoredManager,
      io,
    };
  };

  return {
    bootstrap,
    addManualTab,
    createManager,
    mapper,
    primaryWindow,
    secondaryWindow,
    sessionManager,
    io,
  };
};
