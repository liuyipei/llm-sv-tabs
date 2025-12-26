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

import TabManager from '../../src/main/tab-manager.js';
import { WindowRegistry } from '../../src/main/tab-manager/window-registry.js';
import type { WindowHandle, ViewHandle } from '../../src/main/tab-manager/window-view-handles.js';

class StubWindowHandle implements WindowHandle {
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
  getNativeWindow(): undefined {
    return undefined;
  }
}

const createStubView = () => {
  const view: ViewHandle = {
    webContents: {
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(),
      reload: vi.fn(),
      focus: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    setBounds: vi.fn(),
    getNativeView: vi.fn(),
  };
  return view;
};

describe('Window/View handle isolation', () => {
  it('attaches, resizes, and detaches views without Electron', () => {
    const windowHandle = new StubWindowHandle();
    const viewFactory = vi.fn(() => createStubView());
    const windowRegistryFactory = (mainWindow: WindowHandle, callbacks: any) =>
      new WindowRegistry(mainWindow, callbacks);

    const manager = new TabManager(windowHandle as any, {
      createWindowRegistry: windowRegistryFactory,
      viewFactory,
    });

    const { tabId } = manager.openUrl('https://example.com');
    const createdView = viewFactory.mock.results[0].value;

    expect(windowHandle.addChildView).toHaveBeenCalledWith(createdView);
    expect(createdView.setBounds).toHaveBeenCalledWith({
      x: 350,
      y: 53,
      width: 850,
      height: 747,
    });

    manager.setSearchBarVisible(true);
    expect(createdView.setBounds).toHaveBeenLastCalledWith({
      x: 350,
      y: 98,
      width: 850,
      height: 702,
    });

    manager.closeTab(tabId);
    expect(windowHandle.removeChildView).toHaveBeenCalledWith(createdView);
  });
});
