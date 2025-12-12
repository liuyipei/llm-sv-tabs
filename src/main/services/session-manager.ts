/**
 * Session manager for persisting and restoring tab sessions
 */

import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import type { TabData } from '../../types';

interface SessionData {
  tabs: TabData[];
  activeTabId: string | null;
  lastSaved: number;
}

export class SessionManager {
  private sessionPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.sessionPath = join(userDataPath, 'session.json');
  }

  /**
   * Save current session to disk
   */
  async saveSession(tabs: TabData[], activeTabId: string | null): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      if (!existsSync(userDataPath)) {
        await mkdir(userDataPath, { recursive: true });
      }

      const sessionData: SessionData = {
        tabs,
        activeTabId,
        lastSaved: Date.now(),
      };

      await writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
      console.log(`Session saved: ${tabs.length} tabs`);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Load session from disk
   */
  async loadSession(): Promise<SessionData | null> {
    try {
      if (!existsSync(this.sessionPath)) {
        console.log('No saved session found');
        return null;
      }

      const data = await readFile(this.sessionPath, 'utf-8');
      const sessionData = JSON.parse(data) as SessionData;

      console.log(`Session loaded: ${sessionData.tabs.length} tabs`);
      return sessionData;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  /**
   * Clear saved session
   */
  async clearSession(): Promise<void> {
    try {
      if (existsSync(this.sessionPath)) {
        await writeFile(this.sessionPath, JSON.stringify({ tabs: [], activeTabId: null, lastSaved: Date.now() }), 'utf-8');
        console.log('Session cleared');
      }
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  /**
   * Check if session exists
   */
  hasSession(): boolean {
    return existsSync(this.sessionPath);
  }
}
