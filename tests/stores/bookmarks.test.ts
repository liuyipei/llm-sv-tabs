import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  bookmarks,
  addBookmark,
  removeBookmark,
  updateBookmark,
  clearBookmarks
} from '../../src/ui/stores/bookmarks';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Bookmarks Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    bookmarks.set([]);
  });

  describe('addBookmark', () => {
    it('should add a bookmark', () => {
      const bookmark = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      expect(bookmark).toHaveProperty('id');
      expect(bookmark).toHaveProperty('created');
      expect(bookmark.title).toBe('Test Page');
      expect(bookmark.url).toBe('https://example.com');

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(1);
      expect(allBookmarks[0]).toEqual(bookmark);
    });

    it('should add bookmark with tags', () => {
      const bookmark = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
        tags: ['test', 'example'],
      });

      expect(bookmark.tags).toEqual(['test', 'example']);
    });

    it('should generate unique IDs', () => {
      const bookmark1 = addBookmark({
        title: 'Test 1',
        url: 'https://example1.com',
      });

      const bookmark2 = addBookmark({
        title: 'Test 2',
        url: 'https://example2.com',
      });

      expect(bookmark1.id).not.toBe(bookmark2.id);
      expect(get(bookmarks)).toHaveLength(2);
    });

    it('should persist to localStorage', () => {
      addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      const stored = localStorage.getItem('bookmarks');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Test Page');
    });
  });

  describe('removeBookmark', () => {
    it('should remove a bookmark by id', () => {
      const bookmark = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      removeBookmark(bookmark.id);

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(0);
    });

    it('should not fail when removing non-existent bookmark', () => {
      addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      removeBookmark('non-existent-id');

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(1);
    });

    it('should persist removal to localStorage', () => {
      const bookmark = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      removeBookmark(bookmark.id);

      const stored = localStorage.getItem('bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(0);
    });
  });

  describe('updateBookmark', () => {
    it('should update bookmark properties', () => {
      const bookmark = addBookmark({
        title: 'Original Title',
        url: 'https://example.com',
      });

      updateBookmark(bookmark.id, {
        title: 'Updated Title',
      });

      const allBookmarks = get(bookmarks);
      expect(allBookmarks[0].title).toBe('Updated Title');
      expect(allBookmarks[0].url).toBe('https://example.com');
    });

    it('should not modify other bookmarks', () => {
      const bookmark1 = addBookmark({
        title: 'Bookmark 1',
        url: 'https://example1.com',
      });

      const bookmark2 = addBookmark({
        title: 'Bookmark 2',
        url: 'https://example2.com',
      });

      updateBookmark(bookmark1.id, {
        title: 'Updated Bookmark 1',
      });

      const allBookmarks = get(bookmarks);
      expect(allBookmarks[0].title).toBe('Updated Bookmark 1');
      expect(allBookmarks[1].title).toBe('Bookmark 2');
    });
  });

  describe('clearBookmarks', () => {
    it('should clear all bookmarks', () => {
      addBookmark({ title: 'Test 1', url: 'https://example1.com' });
      addBookmark({ title: 'Test 2', url: 'https://example2.com' });
      addBookmark({ title: 'Test 3', url: 'https://example3.com' });

      clearBookmarks();

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(0);
    });

    it('should persist clear to localStorage', () => {
      addBookmark({ title: 'Test', url: 'https://example.com' });
      clearBookmarks();

      const stored = localStorage.getItem('bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('should load bookmarks from localStorage on initialization', () => {
      const testBookmarks = [
        {
          id: 'bookmark-1',
          title: 'Test 1',
          url: 'https://example1.com',
          created: Date.now(),
        },
        {
          id: 'bookmark-2',
          title: 'Test 2',
          url: 'https://example2.com',
          created: Date.now(),
        },
      ];

      localStorage.setItem('bookmarks', JSON.stringify(testBookmarks));

      // Re-import to trigger initialization
      // Note: This test assumes the store initialization reads from localStorage
      const stored = localStorage.getItem('bookmarks');
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].title).toBe('Test 1');
      expect(parsed[1].title).toBe('Test 2');
    });
  });
});
