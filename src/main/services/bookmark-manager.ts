/**
 * Bookmark manager for persisting bookmarks to disk
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { Bookmark } from '../../types';
import { upsertBookmark } from '../../utils/bookmark-utils';
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
    const { updated, bookmark: result, isNew } = upsertBookmark(this.bookmarks, bookmark);
    this.bookmarks = updated;
    this.saveBookmarks();
    return { bookmark: result, isNew };
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
