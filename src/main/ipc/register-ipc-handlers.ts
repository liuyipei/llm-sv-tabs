import TabManager from '../tab-manager.js';
import { BookmarkManager } from '../services/bookmark-manager.js';
import { ScreenshotService } from '../services/screenshot-service.js';
import { registerTabHandlers } from './handlers/tab-handlers.js';
import { registerBookmarkHandlers } from './handlers/bookmark-handlers.js';
import { registerContentHandlers } from './handlers/content-handlers.js';
import { registerQueryHandlers } from './handlers/query-handlers.js';
import { registerModelHandlers } from './handlers/model-handlers.js';

export interface MainProcessContext {
  tabManager: TabManager | null;
  bookmarkManager: BookmarkManager | null;
  screenshotService: ScreenshotService | null;
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
}
