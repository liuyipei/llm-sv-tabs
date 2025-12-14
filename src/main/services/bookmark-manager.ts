/**
 * Bookmark manager for persisting bookmarks to disk
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { Bookmark } from '../../types';
import { normalizeUrl } from '../../utils/url-normalization';

export class BookmarkManager {
  private bookmarksPath: string;
  private bookmarks: Bookmark[] = [];

  constructor() {
    const userDataPath = app.getPath('userData');
    this.bookmarksPath = join(userDataPath, 'bookmarks.json');
    this.loadBookmarks();
  }

  /**
   * Load bookmarks from disk
   */
  private loadBookmarks(): void {
    try {
      if (existsSync(this.bookmarksPath)) {
        const data = readFileSync(this.bookmarksPath, 'utf-8');
        this.bookmarks = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      this.bookmarks = [];
    }
  }

  /**
   * Save bookmarks to disk
   */
  private saveBookmarks(): void {
    try {
      const userDataPath = app.getPath('userData');
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
      }
      writeFileSync(this.bookmarksPath, JSON.stringify(this.bookmarks, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save bookmarks:', error);
    }
  }

  /**
   * Get all bookmarks
   */
  getBookmarks(): Bookmark[] {
    return [...this.bookmarks];
  }

  /**
   * Add a new bookmark or move existing one to the top
   * Returns the bookmark and whether it was new or moved
   */
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): { bookmark: Bookmark; isNew: boolean } {
    const normalizedUrl = normalizeUrl(bookmark.url);

    // Check if a bookmark with the same normalized URL already exists
    const existingIndex = this.bookmarks.findIndex(
      b => normalizeUrl(b.url) === normalizedUrl
    );

    if (existingIndex !== -1) {
      // Bookmark exists - move it to the end (top of the list when reversed for display)
      const existingBookmark = this.bookmarks[existingIndex];
      // Update the created timestamp to move it to the top
      existingBookmark.created = Date.now();
      // Update title in case it changed
      existingBookmark.title = bookmark.title;

      // Remove from current position
      this.bookmarks.splice(existingIndex, 1);
      // Add to the end (will be shown at top)
      this.bookmarks.push(existingBookmark);

      this.saveBookmarks();
      return { bookmark: existingBookmark, isNew: false };
    }

    // Create new bookmark
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created: Date.now(),
    };

    this.bookmarks.push(newBookmark);
    this.saveBookmarks();
    return { bookmark: newBookmark, isNew: true };
  }

  /**
   * Delete a bookmark
   */
  deleteBookmark(id: string): boolean {
    const initialLength = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);

    if (this.bookmarks.length < initialLength) {
      this.saveBookmarks();
      return true;
    }

    return false;
  }

  /**
   * Update a bookmark
   */
  updateBookmark(id: string, updates: Partial<Bookmark>): Bookmark | null {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) {
      return null;
    }

    this.bookmarks[index] = { ...this.bookmarks[index], ...updates };
    this.saveBookmarks();
    return this.bookmarks[index];
  }

  /**
   * Find bookmark by URL (uses normalized URL for comparison)
   */
  findByUrl(url: string): Bookmark | undefined {
    const normalizedUrl = normalizeUrl(url);
    return this.bookmarks.find((b) => normalizeUrl(b.url) === normalizedUrl);
  }

  /**
   * Clear all bookmarks
   */
  clearBookmarks(): void {
    this.bookmarks = [];
    this.saveBookmarks();
  }
}
