import type { Bookmark } from '../types';
import { normalizeUrl } from './url-normalization.js';

function normalizeFilePath(filePath: string): string {
  const withoutProtocol = filePath.startsWith('file://')
    ? filePath.slice('file://'.length)
    : filePath;

  const unifiedSeparators = withoutProtocol.replace(/\\/g, '/');

  let prefix = '';
  let remainder = unifiedSeparators;

  const driveMatch = /^([A-Za-z]:)(?:\/|$)/.exec(unifiedSeparators);
  if (driveMatch) {
    prefix = `${driveMatch[1]}/`;
    remainder = unifiedSeparators.slice(driveMatch[0].length);
  } else if (unifiedSeparators.startsWith('/')) {
    prefix = '/';
    remainder = unifiedSeparators.slice(1);
  }

  const segments = remainder.split('/');
  const normalizedSegments: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalizedSegments.length) {
        normalizedSegments.pop();
      }
      continue;
    }
    normalizedSegments.push(segment);
  }

  const normalizedPath = normalizedSegments.join('/');
  const withPrefix = prefix ? `${prefix}${normalizedPath}` : normalizedPath;
  return withPrefix || prefix || '.';
}

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
    const normalizedPath = normalizeFilePath(bookmark.filePath);
    const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
    const platformPath = isWindows ? normalizedPath.toLowerCase() : normalizedPath;
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

    // Place the updated bookmark at the start so the newest/moved bookmark
    // appears at the top of the list.
    updated.unshift(updatedBookmark);

    return { updated, bookmark: updatedBookmark, isNew: false };
  }

  const newBookmark: Bookmark = {
    ...bookmark,
    id: bookmark.id || generateBookmarkId(),
    created: bookmark.created || Date.now(),
  } as Bookmark;

  // Add new bookmarks to the start so they appear at the top of the list.
  return { updated: [newBookmark, ...existing], bookmark: newBookmark, isNew: true };
}
