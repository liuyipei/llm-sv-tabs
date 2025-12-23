import { ipcMain } from 'electron';
import { loadCapabilityCacheFromDisk, probeAndCacheModel } from '../../services/model-capabilities.js';
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

export function registerModelHandlers(): void {
  // Quick list sync for CLI probe tool
  ipcMain.handle(
    'sync-quick-list',
    async (
      _event,
      models: Array<{ provider: ProviderType; model: string }>
    ) =>
      handleSafely(async () => {
        const { saveQuickListToFile } = await import(
          '../../../probe/quick-list-file.js'
        );
        await saveQuickListToFile(models);
        return { success: true };
      })
  );

  ipcMain.handle('probe-model', async (_event, provider: ProviderType, model: string, apiKey?: string, endpoint?: string) =>
    handleSafely(async () => {
      const result = await probeAndCacheModel(provider, model, apiKey, endpoint);
      return result;
    })
  );

  ipcMain.handle('load-capability-cache', async () =>
    handleSafely(async () => {
      const cache = await loadCapabilityCacheFromDisk();
      return cache;
    })
  );
}
