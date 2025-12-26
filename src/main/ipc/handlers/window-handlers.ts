import { ipcMain } from 'electron';
import type { WindowId } from '../../tab-manager/window-registry.js';

type CreateNewWindowFn = (url?: string) => Promise<{ windowId: WindowId; tabId?: string }>;

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

export function registerWindowHandlers(
  getCreateNewWindow: () => CreateNewWindowFn
): void {
  // Open a new blank window
  ipcMain.handle('open-new-window', async () =>
    handleSafely(async () => {
      const createNewWindow = getCreateNewWindow();
      const result = await createNewWindow();
      return { success: true, data: result };
    })
  );

  // Open a URL in a new window
  ipcMain.handle('open-url-in-new-window', async (_event, url: string) =>
    handleSafely(async () => {
      const createNewWindow = getCreateNewWindow();
      const result = await createNewWindow(url);
      return { success: true, data: result };
    })
  );
}
