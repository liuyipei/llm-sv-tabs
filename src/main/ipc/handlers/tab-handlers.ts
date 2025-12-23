import { ipcMain } from 'electron';
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
  ipcMain.handle('open-url', async (_event, url: string) =>
    handleSafely(() => {
      const tabManager = getTabManager();

      // Handle special URL schemes
      if (url.startsWith('api-keys://')) {
        return { success: true, data: tabManager.openApiKeyInstructionsTab() };
      }

      return { success: true, data: tabManager.openUrl(url) };
    })
  );

  ipcMain.handle('close-tab', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().closeTab(tabId))
  );

  ipcMain.handle('get-active-tabs', async () =>
    handleSafely(() => ({ success: true, data: getTabManager().getActiveTabs() }))
  );

  ipcMain.handle('set-active-tab', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().setActiveTab(tabId))
  );

  ipcMain.handle('focus-active-web-contents', async () =>
    handleSafely(() => getTabManager().focusActiveWebContents())
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

  ipcMain.handle('next-tab', async () => handleSafely(() => getTabManager().nextTab()));

  ipcMain.handle('previous-tab', async () => handleSafely(() => getTabManager().previousTab()));

  ipcMain.handle('update-tab-title', async (_event, tabId: string, title: string) =>
    handleSafely(() => getTabManager().updateTabTitle(tabId, title))
  );

  ipcMain.handle('copy-tab-url', async (_event, tabId: string) =>
    handleSafely(() => getTabManager().copyTabUrl(tabId))
  );

  ipcMain.handle(
    'open-note-tab',
    async (_event, noteId: number, title: string, content: string, fileType?: 'text' | 'pdf' | 'image', filePath?: string) =>
      handleSafely(() => ({ success: true, data: getTabManager().openNoteTab(noteId, title, content, fileType, true, filePath) }))
  );

  ipcMain.handle('update-note-content', async (_event, tabId: string, content: string) =>
    handleSafely(() => getTabManager().updateNoteContent(tabId, content))
  );

  ipcMain.handle('open-llm-response-tab', async (_event, query: string, response?: string, error?: string) =>
    handleSafely(() => ({ success: true, data: getTabManager().openLLMResponseTab(query, response, error) }))
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
