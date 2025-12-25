import TabManager from '../tab-manager.js';
import { BookmarkManager } from '../services/bookmark-manager.js';
import { ScreenshotService } from '../services/screenshot-service.js';
import { registerSecureStorageHandlers } from '../services/secure-storage.js';
import { registerTabHandlers } from './handlers/tab-handlers.js';
import { registerBookmarkHandlers } from './handlers/bookmark-handlers.js';
import { registerContentHandlers } from './handlers/content-handlers.js';
import { registerQueryHandlers } from './handlers/query-handlers.js';
import { registerModelHandlers } from './handlers/model-handlers.js';
import { registerWindowHandlers } from './handlers/window-handlers.js';
import type { WindowId } from '../tab-manager/window-registry.js';

export interface MainProcessContext {
  tabManager: TabManager | null;
  bookmarkManager: BookmarkManager | null;
  screenshotService: ScreenshotService | null;
  createNewWindow: ((url?: string) => Promise<{ windowId: WindowId; tabId?: string }>) | null;
}

function createContextAccessors(context: MainProcessContext) {
  const ensure = <T>(value: T | null, name: string): T => {
    if (!value) {
      throw new Error(`${name} not initialized`);
    }
    return value;
  };

  return {
    tabManager: () => ensure(context.tabManager, 'TabManager'),
    bookmarkManager: () => ensure(context.bookmarkManager, 'BookmarkManager'),
    screenshotService: () => ensure(context.screenshotService, 'ScreenshotService'),
    createNewWindow: () => ensure(context.createNewWindow, 'createNewWindow'),
  };
}

export function registerIpcHandlers(context: MainProcessContext): void {
  const get = createContextAccessors(context);

  // Register domain-specific handlers
  registerTabHandlers(get.tabManager);
  registerBookmarkHandlers(get.tabManager, get.bookmarkManager);
  registerContentHandlers(get.tabManager, get.screenshotService);
  registerQueryHandlers(get.tabManager);
  registerModelHandlers();
  registerWindowHandlers(get.createNewWindow);
  
  // Register secure storage handlers
  registerSecureStorageHandlers();
}
