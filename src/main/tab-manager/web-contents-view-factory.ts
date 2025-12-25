import { Menu, MenuItem, WebContentsView } from 'electron';

export interface ViewFactoryOptions {
  openUrl: (url: string) => void;
  openUrlInNewWindow?: (url: string) => void;
}

export function createConfiguredView(openUrl: (url: string) => void, openUrlInNewWindow?: (url: string) => void): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  setupContextMenu(view, openUrl, openUrlInNewWindow);
  setupWindowOpenHandler(view, openUrl, openUrlInNewWindow);

  return view;
}

function setupContextMenu(view: WebContentsView, openUrl: (url: string) => void, openUrlInNewWindow?: (url: string) => void): void {
  view.webContents.on('context-menu', (_event, params) => {
    const { linkURL, x, y } = params;

    if (!linkURL) return;

    const menu = new Menu();

    menu.append(new MenuItem({
      label: 'Open link in new tab',
      click: () => {
        openUrl(linkURL);
      }
    }));

    if (openUrlInNewWindow) {
      menu.append(new MenuItem({
        label: 'Open link in new window',
        click: () => {
          openUrlInNewWindow(linkURL);
        }
      }));
    }

    menu.append(new MenuItem({
      label: 'Save link as...',
      click: async () => {
        try {
          await view.webContents.downloadURL(linkURL);
        } catch (error) {
          console.error('Failed to download:', error);
        }
      }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Inspect',
      click: () => {
        view.webContents.inspectElement(x, y);
        if (!view.webContents.isDevToolsOpened()) {
          view.webContents.openDevTools();
        }
      }
    }));

    menu.popup();
  });
}

function setupWindowOpenHandler(view: WebContentsView, openUrl: (url: string) => void, openUrlInNewWindow?: (url: string) => void): void {
  view.webContents.setWindowOpenHandler((details) => {
    // Handle shift+click: opens in new window
    if (details.disposition === 'new-window' && openUrlInNewWindow) {
      openUrlInNewWindow(details.url);
      return { action: 'deny' };
    }

    // Handle regular clicks that want new tabs
    if (details.disposition === 'foreground-tab' || details.disposition === 'background-tab') {
      openUrl(details.url);
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });
}
