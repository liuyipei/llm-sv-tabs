import type { Writable } from 'svelte/store';
import type { Bookmark } from '../../types';
import { upsertBookmark, type BookmarkInput } from '../../utils/bookmark-utils';
import { normalizeUrl } from '../../utils/url-normalization';
import { createPersistedStore } from '../utils/persisted-store';

// Bookmarks store with localStorage persistence
export const bookmarks: Writable<Bookmark[]> = createPersistedStore<Bookmark[]>('bookmarks', []);

// Helper functions
export function addBookmark(bookmark: BookmarkInput): { bookmark: Bookmark; isNew: boolean } {
  let resultBookmark: Bookmark | undefined;
  let isNew = true;

  bookmarks.update((items) => {
    const result = upsertBookmark(items, bookmark);
    resultBookmark = result.bookmark;
    isNew = result.isNew;
    return result.updated;
  });

  return { bookmark: resultBookmark!, isNew };
}

export function removeBookmark(id: string): void {
  bookmarks.update((items) => items.filter((b) => b.id !== id));
}

export function updateBookmark(id: string, updates: Partial<Bookmark>): void {
  bookmarks.update((items) =>
    items.map((b) => (b.id === id ? { ...b, ...updates } : b))
  );
}

export function findBookmarkByUrl(url: string): Bookmark | undefined {
  const normalizedUrl = normalizeUrl(url);
  let found: Bookmark | undefined;
  bookmarks.subscribe((items) => {
    found = items.find((b) => normalizeUrl(b.url) === normalizedUrl);
  })();
  return found;
}

export function clearBookmarks(): void {
  bookmarks.set([]);
}
