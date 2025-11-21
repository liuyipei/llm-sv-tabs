/**
 * Bookmark manager for persisting bookmarks to disk
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { Bookmark } from '../../types';

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
   * Add a new bookmark
   */
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Bookmark {
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created: Date.now(),
    };

    this.bookmarks.push(newBookmark);
    this.saveBookmarks();
    return newBookmark;
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
   * Find bookmark by URL
   */
  findByUrl(url: string): Bookmark | undefined {
    return this.bookmarks.find((b) => b.url === url);
  }

  /**
   * Clear all bookmarks
   */
  clearBookmarks(): void {
    this.bookmarks = [];
    this.saveBookmarks();
  }
}
