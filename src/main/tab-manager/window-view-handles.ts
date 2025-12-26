import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import type { ViewHandle } from '../../types.js';

export interface WindowHandle {
  on(event: string, listener: (...args: any[]) => void): void;
  getContentBounds(): { width: number; height: number };
  addChildView(view: ViewHandle): void;
  removeChildView(view: ViewHandle): void;
  show(): void;
  focus(): void;
  webContents: {
    focus(): void;
    send(channel: string, data?: any): void;
  };
  getNativeWindow(): BrowserWindow | undefined;
}

export class ElectronViewHandle implements ViewHandle {
  constructor(private readonly view: WebContentsView) {}

  get webContents(): WebContents {
    return this.view.webContents;
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.view.setBounds(bounds);
  }

  getNativeView(): WebContentsView {
    return this.view;
  }
}

export class ElectronWindowHandle implements WindowHandle {
  constructor(private readonly window: BrowserWindow) {}

  on(event: 'resize' | 'close', listener: () => void): void {
    (this.window as any).on(event, listener);
  }

  getContentBounds(): { width: number; height: number } {
    return this.window.getContentBounds();
  }

  addChildView(view: ViewHandle): void {
    const native = view.getNativeView?.() ?? (view as any);
    this.window.contentView.addChildView(native as WebContentsView);
  }

  removeChildView(view: ViewHandle): void {
    const native = view.getNativeView?.() ?? (view as any);
    this.window.contentView.removeChildView(native as WebContentsView);
  }

  show(): void {
    this.window.show();
  }

  focus(): void {
    this.window.focus();
  }

  webContents = {
    focus: () => this.window.webContents.focus(),
    send: (channel: string, data?: any) => this.window.webContents.send(channel, data),
  };

  getNativeWindow(): BrowserWindow {
    return this.window;
  }
}

export function isElectronWindowHandle(handle: any): handle is ElectronWindowHandle {
  return typeof handle?.getNativeWindow === 'function';
}
