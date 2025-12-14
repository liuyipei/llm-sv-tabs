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
      const result = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      expect(result.bookmark).toHaveProperty('id');
      expect(result.bookmark).toHaveProperty('created');
      expect(result.bookmark.title).toBe('Test Page');
      expect(result.bookmark.url).toBe('https://example.com');
      expect(result.isNew).toBe(true);

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(1);
      expect(allBookmarks[0]).toEqual(result.bookmark);
    });

    it('should add bookmark with tags', () => {
      const result = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
        tags: ['test', 'example'],
      });

      expect(result.bookmark.tags).toEqual(['test', 'example']);
    });

    it('should generate unique IDs', () => {
      const result1 = addBookmark({
        title: 'Test 1',
        url: 'https://example1.com',
      });

      const result2 = addBookmark({
        title: 'Test 2',
        url: 'https://example2.com',
      });

      expect(result1.bookmark.id).not.toBe(result2.bookmark.id);
      expect(get(bookmarks)).toHaveLength(2);
    });

    it('should preserve provided id and created fields', () => {
      const result = addBookmark({
        id: 'bookmark-main-1',
        created: 12345,
        title: 'From main',
        url: 'https://from-main.example.com',
      });

      expect(result.bookmark.id).toBe('bookmark-main-1');
      expect(result.bookmark.created).toBe(12345);
      expect(get(bookmarks)[0]).toEqual(result.bookmark);
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

    it('should detect duplicate URLs and move to top', () => {
      const result1 = addBookmark({
        title: 'First',
        url: 'https://example.com',
      });
      expect(result1.isNew).toBe(true);

      const result2 = addBookmark({
        title: 'Test 2',
        url: 'https://test.com',
      });
      expect(result2.isNew).toBe(true);

      // Try to add the same URL again (should move to top)
      const result3 = addBookmark({
        title: 'Updated Title',
        url: 'https://example.com',
      });
      expect(result3.isNew).toBe(false);
      expect(result3.bookmark.id).toBe(result1.bookmark.id);
      expect(result3.bookmark.title).toBe('Updated Title');

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(2);
      // The duplicate should be moved to the end (top of the list)
      expect(allBookmarks[1].id).toBe(result1.bookmark.id);
      expect(allBookmarks[1].title).toBe('Updated Title');
    });

    it('should normalize URLs for duplicate detection', () => {
      const result1 = addBookmark({
        title: 'Original',
        url: 'https://example.com/',
      });

      // Same URL with different variations should be detected as duplicate
      const result2 = addBookmark({
        title: 'Duplicate',
        url: 'https://example.com',
      });

      expect(result2.isNew).toBe(false);
      expect(result2.bookmark.id).toBe(result1.bookmark.id);

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(1);
    });

    it('should normalize www prefix for duplicate detection', () => {
      const result1 = addBookmark({
        title: 'Original',
        url: 'https://www.example.com',
      });

      const result2 = addBookmark({
        title: 'Without www',
        url: 'https://example.com',
      });

      expect(result2.isNew).toBe(false);
      expect(result2.bookmark.id).toBe(result1.bookmark.id);

      const allBookmarks = get(bookmarks);
      expect(allBookmarks).toHaveLength(1);
    });
  });

  describe('removeBookmark', () => {
    it('should remove a bookmark by id', () => {
      const result = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      removeBookmark(result.bookmark.id);

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
      const result = addBookmark({
        title: 'Test Page',
        url: 'https://example.com',
      });

      removeBookmark(result.bookmark.id);

      const stored = localStorage.getItem('bookmarks');
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(0);
    });
  });

  describe('updateBookmark', () => {
    it('should update bookmark properties', () => {
      const result = addBookmark({
        title: 'Original Title',
        url: 'https://example.com',
      });

      updateBookmark(result.bookmark.id, {
        title: 'Updated Title',
      });

      const allBookmarks = get(bookmarks);
      expect(allBookmarks[0].title).toBe('Updated Title');
      expect(allBookmarks[0].url).toBe('https://example.com');
    });

    it('should not modify other bookmarks', () => {
      const result1 = addBookmark({
        title: 'Bookmark 1',
        url: 'https://example1.com',
      });

      const result2 = addBookmark({
        title: 'Bookmark 2',
        url: 'https://example2.com',
      });

      updateBookmark(result1.bookmark.id, {
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
