import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type TabManager from '../../tab-manager.js';
import { ContentExtractor } from '../../services/content-extractor.js';
import { ModelDiscovery } from '../../providers/model-discovery.js';
import type { ScreenshotService } from '../../services/screenshot-service.js';
import type { ProviderType } from '../../../types';

type HandlerError = { success: false; error: string };

const toHandlerError = (error: unknown): HandlerError => ({
  success: false,
  error: error instanceof Error ? error.message : String(error),
});

async function handleSafely<T>(
  handler: () => Promise<T> | T
): Promise<T | HandlerError> {
  try {
    return await handler();
  } catch (error) {
    return toHandlerError(error);
  }
}

export function registerContentHandlers(
  getTabManager: () => TabManager,
  getScreenshotService: () => ScreenshotService
): void {
  const resolveWindowId = (event: IpcMainInvokeEvent): string =>
    getTabManager().getWindowIdFor(BrowserWindow.fromWebContents(event.sender));

  // Content extraction
  ipcMain.handle('extract-content', async (_event, tabId: string, includeScreenshot = false) =>
    handleSafely(async () => {
      const view = getTabManager().getTabView(tabId);
      if (!view) {
        return { success: false, error: 'Tab not found' } as const;
      }

      const content = await ContentExtractor.extractFromTab(view, tabId, includeScreenshot);
      return { success: true, data: content };
    })
  );

  // Model discovery
  ipcMain.handle('discover-models', async (_event, provider: ProviderType, apiKey?: string, endpoint?: string) =>
    handleSafely(async () => {
      const models = await ModelDiscovery.discoverModels(provider, apiKey, endpoint);
      return { success: true, data: models };
    })
  );

  // Find in page
  ipcMain.handle('find-in-page', async (_event, tabId: string, text: string) =>
    handleSafely(() => getTabManager().findInPage(tabId, text))
  );

  ipcMain.handle('find-next', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().findNext(tabId))
  );

  ipcMain.handle('find-previous', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().findPrevious(tabId))
  );

  ipcMain.handle('stop-find-in-page', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().stopFindInPage(tabId))
  );

  ipcMain.handle('set-search-bar-visible', async (event, visible: boolean) =>
    handleSafely(() => {
      getTabManager().setSearchBarVisible(visible, resolveWindowId(event));
      return { success: true };
    })
  );

  // Screenshot capture
  ipcMain.handle('trigger-screenshot', async (event) =>
    handleSafely(async () => {
      const screenshotService = getScreenshotService();
      const tabManager = getTabManager();
      const windowId = resolveWindowId(event);

      console.log('Main: Starting screenshot capture...');
      const dataUrl = await screenshotService.startCapture();

      if (!dataUrl) {
        console.log('Main: Screenshot was cancelled by user');
        return { success: false, error: 'Screenshot cancelled' } as const;
      }

      console.log('Main: Screenshot captured successfully, creating tab...');

      // Create a new image tab with the screenshot
      const timestamp = new Date()
        .toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        .replace(/\//g, '-')
        .replace(',', '');

      const title = `Screenshot ${timestamp}`;
      const noteId = Date.now();

      tabManager.openNoteTab(noteId, title, dataUrl, 'image', true, undefined, windowId);

      console.log('Main: Screenshot tab created successfully');
      return { success: true };
    })
  );
}
