import { Menu, MenuItem, WebContentsView } from 'electron';

export function createConfiguredView(openUrl: (url: string) => void): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  setupContextMenu(view, openUrl);
  setupWindowOpenHandler(view, openUrl);

  return view;
}

function setupContextMenu(view: WebContentsView, openUrl: (url: string) => void): void {
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

function setupWindowOpenHandler(view: WebContentsView, openUrl: (url: string) => void): void {
  view.webContents.setWindowOpenHandler((details) => {
    if (details.disposition === 'foreground-tab' || details.disposition === 'background-tab') {
      openUrl(details.url);
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });
}
