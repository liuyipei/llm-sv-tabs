import type { Bookmark } from '../types';
import { normalizeUrl } from './url-normalization';

export type BookmarkInput = Omit<Bookmark, 'id' | 'created'> &
  Partial<Pick<Bookmark, 'id' | 'created'>>;

function generateBookmarkId(): string {
  return `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function upsertBookmark(
  existing: Bookmark[],
  bookmark: BookmarkInput
): { updated: Bookmark[]; bookmark: Bookmark; isNew: boolean } {
  const normalizedUrl = normalizeUrl(bookmark.url);
  const existingIndex = existing.findIndex((item) => normalizeUrl(item.url) === normalizedUrl);

  if (existingIndex !== -1) {
    const updatedBookmark: Bookmark = {
      ...existing[existingIndex],
      title: bookmark.title,
      url: bookmark.url,
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
