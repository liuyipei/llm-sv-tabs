import type { BookmarkResult } from '../../types';
import { addBookmark as addBookmarkToStore } from '$stores/bookmarks';
import { toastStore } from '$stores/toast';

type IpcBookmarkResponse = { success?: boolean; data?: unknown };

function isBookmarkResult(data: unknown): data is BookmarkResult {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.bookmark === 'object' && typeof candidate.isNew === 'boolean';
}

export function parseBookmarkResult(result: unknown): BookmarkResult | null {
  if (isBookmarkResult(result)) {
    return result;
  }

  const response = result as IpcBookmarkResponse;
  if (response?.success && isBookmarkResult(response.data)) {
    return response.data;
  }

  return null;
}

export function applyBookmarkResult(result: BookmarkResult): void {
  addBookmarkToStore(result.bookmark);
  const message = result.isNew
    ? `Bookmark added: ${result.bookmark.title}`
    : `Bookmark moved to top: ${result.bookmark.title}`;
  toastStore.show(message, result.isNew ? 'success' : 'info');
}

export function handleBookmarkResponse(result: unknown): boolean {
  const parsed = parseBookmarkResult(result);
  if (!parsed) return false;
  applyBookmarkResult(parsed);
  return true;
}
