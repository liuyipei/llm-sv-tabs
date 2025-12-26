import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => {
  class BrowserWindow {}
  class WebContentsView {}
  return {
    BrowserWindow,
    WebContentsView,
    app: {
      getPath: vi.fn(() => '/tmp'),
      on: vi.fn(),
    },
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => false),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    },
  };
});

import TabManager from '../../src/main/tab-manager.js';
import type { WindowId } from '../../src/main/tab-manager/window-registry.js';

class FakeWindowRegistry {
  public contexts = new Map<WindowId, any>();
  public setTabOwner = vi.fn();
  public setSearchBarVisible = vi.fn();
  public setActiveTab = vi.fn();
  public getWindowSnapshots = vi.fn(() => []);

  constructor() {
    this.contexts.set('win-1', {
      id: 'win-1' as WindowId,
      window: {
        on: vi.fn(),
        getContentBounds: vi.fn(() => ({ width: 1200, height: 800 })),
        removeChildView: vi.fn(),
        addChildView: vi.fn(),
        webContents: { focus: vi.fn(), send: vi.fn() },
        show: vi.fn(),
        focus: vi.fn(),
        getNativeWindow: vi.fn(),
      },
      activeTabId: null,
      isSearchBarVisible: false,
    });
  }

  getWindowContext(windowId?: WindowId) {
    return this.contexts.get(windowId ?? 'win-1');
  }

  getWindowIdForTab(_tabId: string, _fallback?: WindowId) {
    return 'win-1' as WindowId;
  }

  getTabIdsForWindow(_windowId: WindowId) {
    return [];
  }

  getPrimaryWindowId() {
    return 'win-1' as WindowId;
  }

  getWindowIdFor() {
    return 'win-1' as WindowId;
  }
}

const createMockView = () => ({
  webContents: {
    loadURL: vi.fn(),
    on: vi.fn(),
    reload: vi.fn(),
    isDestroyed: vi.fn(() => false),
    removeAllListeners: vi.fn(),
  },
  setBounds: vi.fn(),
});

describe('TabManager viewFactory seam', () => {
  it('invokes injected viewFactory for new tabs and wires loadURL', () => {
    const viewFactory = vi.fn(() => createMockView());
    const windowRegistry = new FakeWindowRegistry();
    const stubHandle = {
      on: vi.fn(),
      getContentBounds: vi.fn(() => ({ width: 1200, height: 800 })),
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
      webContents: { focus: vi.fn(), send: vi.fn() },
      show: vi.fn(),
      focus: vi.fn(),
      getNativeWindow: vi.fn(),
    };

    const manager = new TabManager({} as any, {
      createWindowHandle: () => stubHandle as any,
      createWindowRegistry: () => windowRegistry as any,
      viewFactory,
    });

    manager.openUrl('https://example.com');

    expect(viewFactory).toHaveBeenCalledWith('win-1');
    const createdView = viewFactory.mock.results[0].value;
    expect(createdView.webContents.loadURL).toHaveBeenCalledWith('https://example.com');
    expect(windowRegistry.setTabOwner).toHaveBeenCalledWith(expect.any(String), 'win-1');
  });
});
