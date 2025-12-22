/**
 * Quick List File Storage
 *
 * Shared file storage for the quick list that can be accessed by both
 * the Electron app and the headless CLI.
 */

import type { ProviderType } from '../../types';

export interface QuickListEntry {
  provider: ProviderType;
  model: string;
}

export interface QuickListFile {
  version: string;
  lastUpdated: number;
  models: QuickListEntry[];
}

const FILE_VERSION = '1.0.0';
const QUICK_LIST_FILE_NAME = 'quick-list.json';

/**
 * Get the path to the quick list file
 */
export function getQuickListPath(): string {
  // This works in both Node.js and Electron main process
  const os = require('os');
  const path = require('path');
  const homeDir = os.homedir();
  return path.join(homeDir, '.llm-tabs', QUICK_LIST_FILE_NAME);
}

/**
 * Load quick list from the shared file
 */
export async function loadQuickListFromFile(
  filePath?: string
): Promise<QuickListEntry[] | null> {
  const fs = await import('fs').then(m => m.promises);
  const targetPath = filePath || getQuickListPath();

  try {
    const content = await fs.readFile(targetPath, 'utf-8');
    const data = JSON.parse(content) as QuickListFile;

    // Validate version
    if (!data.version || !data.models) {
      console.warn('Invalid quick list file format');
      return null;
    }

    return data.models;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist
    }
    console.error('Failed to load quick list:', error);
    return null;
  }
}

/**
 * Save quick list to the shared file
 */
export async function saveQuickListToFile(
  models: QuickListEntry[],
  filePath?: string
): Promise<void> {
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');
  const targetPath = filePath || getQuickListPath();

  const data: QuickListFile = {
    version: FILE_VERSION,
    lastUpdated: Date.now(),
    models,
  };

  // Ensure directory exists
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  // Write file
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check if quick list file exists
 */
export async function quickListFileExists(filePath?: string): Promise<boolean> {
  const fs = await import('fs').then(m => m.promises);
  const targetPath = filePath || getQuickListPath();

  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
