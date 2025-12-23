import { ipcMain } from 'electron';
import type TabManager from '../../tab-manager.js';
import type { BookmarkManager } from '../../services/bookmark-manager.js';
import type { Bookmark } from '../../../types';

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

export function registerBookmarkHandlers(
  getTabManager: () => TabManager,
  getBookmarkManager: () => BookmarkManager
): void {
  ipcMain.handle('get-bookmarks', async () =>
    handleSafely(() => ({ success: true, data: getBookmarkManager().getBookmarks() }))
  );

  ipcMain.handle('add-bookmark', async (_event, bookmark: Omit<Bookmark, 'id' | 'created'>) =>
    handleSafely(() => ({ success: true, data: getBookmarkManager().addBookmark(bookmark) }))
  );

  ipcMain.handle('delete-bookmark', async (_event, id: string) =>
    handleSafely(() => ({ success: getBookmarkManager().deleteBookmark(id), data: { id } }))
  );

  // Open a bookmark - handles both web URLs and file-based bookmarks (PDFs, images, text)
  ipcMain.handle('open-bookmark', async (_event, bookmark: Bookmark) =>
    handleSafely(() => {
      const tabManager = getTabManager();

      // If the bookmark has file path and type, it's a file-based bookmark
      if (bookmark.filePath && bookmark.fileType) {
        // Use the session persistence service to restore the file tab
        return tabManager.openFileFromBookmark(bookmark.title, bookmark.filePath, bookmark.fileType, bookmark.noteId);
      }

      // Note bookmark with persisted content/id
      if (bookmark.noteId !== undefined) {
        const fileType = bookmark.fileType ?? 'text';
        const noteContent = bookmark.noteContent ?? '';
        return { success: true, data: tabManager.openNoteTab(bookmark.noteId, bookmark.title, noteContent, fileType, true, bookmark.filePath) };
      }

      // Legacy note:// bookmarks without metadata
      if (bookmark.url?.toLowerCase().startsWith('note://')) {
        const rawId = bookmark.url.replace('note://', '');
        const parsedId = Number.parseInt(rawId, 10);
        if (!Number.isNaN(parsedId)) {
          const fileType = bookmark.fileType ?? 'text';
          const noteContent = bookmark.noteContent ?? '';
          return { success: true, data: tabManager.openNoteTab(parsedId, bookmark.title, noteContent, fileType, true, bookmark.filePath) };
        }
        return { success: false, error: 'Invalid note bookmark' };
      }

      // Regular web bookmark - use standard openUrl
      return { success: true, data: tabManager.openUrl(bookmark.url) };
    })
  );
}
