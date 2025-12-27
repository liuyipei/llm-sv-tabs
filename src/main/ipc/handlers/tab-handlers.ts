import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type TabManager from '../../tab-manager.js';

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

export function registerTabHandlers(
  getTabManager: () => TabManager
): void {
  const resolveWindowId = (event: IpcMainInvokeEvent): string =>
    getTabManager().getWindowIdFor(BrowserWindow.fromWebContents(event.sender));

  ipcMain.handle('open-url', async (event, url: string) =>
    handleSafely(() => {
      const tabManager = getTabManager();

      // Handle special URL schemes
      if (url.startsWith('api-keys://')) {
        return { success: true, data: tabManager.openApiKeyInstructionsTab(true, resolveWindowId(event)) };
      }

      return { success: true, data: tabManager.openUrl(url, true, resolveWindowId(event)) };
    })
  );

  ipcMain.handle('close-tab', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().closeTab(tabId))
  );

  ipcMain.handle('get-active-tabs', async (event) =>
    handleSafely(() => ({ success: true, data: getTabManager().getActiveTabs(resolveWindowId(event)) }))
  );

  ipcMain.handle('get-tab-registry-snapshot', async () =>
    handleSafely(() => ({ success: true, data: getTabManager().getRegistrySnapshot() }))
  );

  ipcMain.handle('open-aggregate-tab', async (event) =>
    handleSafely(() => ({ success: true, data: getTabManager().openAggregateTab(true, resolveWindowId(event)) }))
  );

  ipcMain.handle('set-active-tab', async (event, tabId: string) =>
    handleSafely(() => getTabManager().setActiveTab(tabId, resolveWindowId(event)))
  );

  ipcMain.handle('focus-active-web-contents', async (event) =>
    handleSafely(() => getTabManager().focusActiveWebContents(resolveWindowId(event)))
  );

  ipcMain.handle('select-tabs', async (_event, tabIds: string[]) =>
    handleSafely(() => ({ success: true, data: getTabManager().selectTabs(tabIds) }))
  );

  ipcMain.handle('reload-tab', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().reloadTab(tabId))
  );

  ipcMain.handle('go-back', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().goBack(tabId))
  );

  ipcMain.handle('go-forward', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().goForward(tabId))
  );

  ipcMain.handle('get-navigation-state', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().getNavigationState(tabId))
  );

  ipcMain.handle('next-tab', async (event) => handleSafely(() => getTabManager().nextTab(resolveWindowId(event))));

  ipcMain.handle('previous-tab', async (event) => handleSafely(() => getTabManager().previousTab(resolveWindowId(event))));

  ipcMain.handle('update-tab-title', async (_event, tabId: string, title: string) =>
    handleSafely(() => getTabManager().updateTabTitle(tabId, title))
  );

  ipcMain.handle('copy-tab-url', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().copyTabUrl(tabId))
  );

  ipcMain.handle(
    'open-note-tab',
    async (event, noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string, autoSelect: boolean = true) =>
      handleSafely(() => ({
        success: true,
        data: getTabManager().openNoteTab(noteId, title, content, fileType, autoSelect, filePath, resolveWindowId(event)),
      }))
  );

  ipcMain.handle('update-note-content', async (_event, tabId: string, content: string) =>
    handleSafely(() => getTabManager().updateNoteContent(tabId, content))
  );

  ipcMain.handle('open-llm-response-tab', async (event, query: string, response?: string, error?: string) =>
    handleSafely(() => ({ success: true, data: getTabManager().openLLMResponseTab(query, response, error, true, resolveWindowId(event)) }))
  );

  ipcMain.handle('update-llm-response-tab', async (_event, tabId: string, response: string, metadata?: any) =>
    handleSafely(() => {
      const result = getTabManager().updateLLMResponseTab(tabId, response, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('update-llm-metadata', async (_event, tabId: string, metadata: any) =>
    handleSafely(() => {
      const result = getTabManager().updateLLMMetadata(tabId, metadata);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('open-raw-message-viewer', async (_event, tabId: string) =>
    handleSafely(() => {
      const result = getTabManager().openRawMessageViewer(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );

  ipcMain.handle('open-debug-info-window', async (_event, tabId: string) =>
    handleSafely(() => {
      const result = getTabManager().openDebugInfoWindow(tabId);
      return result.success ? { success: true } : { success: false, error: result.error };
    })
  );
}
