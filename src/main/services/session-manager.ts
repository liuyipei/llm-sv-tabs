/**
 * Session manager for persisting and restoring tab sessions
 */

import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
  saveSession(tabs: TabData[], activeTabId: string | null): void {
    try {
      const userDataPath = app.getPath('userData');
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
      }

      const sessionData: SessionData = {
        tabs,
        activeTabId,
        lastSaved: Date.now(),
      };

      writeFileSync(this.sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
      console.log(`Session saved: ${tabs.length} tabs`);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Load session from disk
   */
  loadSession(): SessionData | null {
    try {
      if (!existsSync(this.sessionPath)) {
        console.log('No saved session found');
        return null;
      }

      const data = readFileSync(this.sessionPath, 'utf-8');
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
  clearSession(): void {
    try {
      if (existsSync(this.sessionPath)) {
        writeFileSync(this.sessionPath, JSON.stringify({ tabs: [], activeTabId: null, lastSaved: Date.now() }), 'utf-8');
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
