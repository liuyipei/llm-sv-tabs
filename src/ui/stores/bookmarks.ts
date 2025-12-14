import { writable, type Writable } from 'svelte/store';
import type { Bookmark } from '../../types';
import { upsertBookmark, type BookmarkInput } from '../../utils/bookmark-utils';
import { normalizeUrl } from '../../utils/url-normalization';

// Create a persisted store that syncs with localStorage
function createPersistedStore<T>(key: string, initial: T): Writable<T> {
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  // Load initial value from localStorage
  let initialValue = initial;
  if (isBrowser) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        initialValue = JSON.parse(stored);
      } catch (e) {
        console.warn(`Failed to parse stored value for ${key}`, e);
      }
    }
  }

  // Create the base writable store
  const { subscribe, set, update } = writable<T>(initialValue);

  // Return a custom store object that persists on set/update
  return {
    subscribe,
    set: (value: T) => {
      if (isBrowser) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      set(value);
    },
    update: (fn: (value: T) => T) => {
      update((current) => {
        const newValue = fn(current);
        if (isBrowser) {
          localStorage.setItem(key, JSON.stringify(newValue));
        }
        return newValue;
      });
    }
  };
}

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
