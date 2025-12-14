import { normalize as normalizePath } from 'path';
import type { Bookmark } from '../types';
import { normalizeUrl } from './url-normalization.js';

export type BookmarkInput = Omit<Bookmark, 'id' | 'created'> &
  Partial<Pick<Bookmark, 'id' | 'created'>>;

function generateBookmarkId(): string {
  return `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the key used for comparing bookmarks for duplicates.
 * For file-based bookmarks, use the file path.
 * For web bookmarks, use the normalized URL.
 */
function getBookmarkComparisonKey(bookmark: Pick<Bookmark, 'url' | 'filePath'>): string {
  // For file-based bookmarks, use the file path for comparison
  if (bookmark.filePath) {
    const normalizedPath = normalizePath(bookmark.filePath);
    const platformPath = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    return `file://${platformPath}`;
  }
  // For web bookmarks, use normalized URL
  return normalizeUrl(bookmark.url);
}

export function upsertBookmark(
  existing: Bookmark[],
  bookmark: BookmarkInput
): { updated: Bookmark[]; bookmark: Bookmark; isNew: boolean } {
  const comparisonKey = getBookmarkComparisonKey(bookmark);
  const existingIndex = existing.findIndex((item) => getBookmarkComparisonKey(item) === comparisonKey);

  if (existingIndex !== -1) {
    const updatedBookmark: Bookmark = {
      ...existing[existingIndex],
      title: bookmark.title,
      url: bookmark.url,
      filePath: bookmark.filePath,
      fileType: bookmark.fileType,
      noteId: bookmark.noteId,
      noteContent: bookmark.noteContent,
      created: Date.now(),
    };

    const updated = [...existing];
    updated.splice(existingIndex, 1);
    updated.push(updatedBookmark);

    return { updated, bookmark: updatedBookmark, isNew: false };
  }

  const newBookmark: Bookmark = {
    ...bookmark,
    id: bookmark.id || generateBookmarkId(),
    created: bookmark.created || Date.now(),
  } as Bookmark;

  return { updated: [...existing, newBookmark], bookmark: newBookmark, isNew: true };
}
