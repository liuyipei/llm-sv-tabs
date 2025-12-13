import { app } from 'electron';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Service for managing temporary files used to display PDFs and images.
 *
 * Problem: Chromium has a ~2MB limit on data URLs passed to loadURL().
 * Large PDFs/images encoded as base64 data URLs exceed this limit and fail to load.
 *
 * Solution: Write files to a temp directory and load via file:// protocol,
 * which has no size limit. Clean up temp files when tabs close or app quits.
 */
class TempFileService {
  private tempDir: string;
  private trackedFiles: Map<string, string> = new Map(); // tabId -> tempFilePath

  constructor() {
    this.tempDir = join(app.getPath('temp'), 'llm-sv-tabs-files');
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get the file extension for a given file type.
   */
  private getExtension(fileType: 'pdf' | 'image', mimeType?: string): string {
    if (fileType === 'pdf') return '.pdf';

    // For images, try to get extension from mime type
    if (mimeType) {
      const mimeToExt: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/bmp': '.bmp',
      };
      return mimeToExt[mimeType] || '.png';
    }
    return '.png';
  }

  /**
   * Write content to a temp file and return the file:// URL.
   *
   * @param tabId - Tab ID to associate with this temp file (for cleanup)
   * @param content - Base64 data URL (e.g., "data:application/pdf;base64,...")
   * @param fileType - Type of file ('pdf' or 'image')
   * @returns file:// URL to load in WebContentsView
   */
  writeToTempFile(tabId: string, content: string, fileType: 'pdf' | 'image'): string {
    this.ensureTempDir();

    // Parse the data URL to get raw base64 and mime type
    // Format: data:<mimeType>;base64,<data>
    const matches = content.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const extension = this.getExtension(fileType, mimeType);
    const fileName = `${randomUUID()}${extension}`;
    const filePath = join(this.tempDir, fileName);

    // Write the file
    writeFileSync(filePath, buffer);

    // Track for cleanup
    this.trackedFiles.set(tabId, filePath);

    return `file://${filePath}`;
  }

  /**
   * Clean up temp file for a specific tab.
   * Call this when a tab is closed.
   */
  cleanupForTab(tabId: string): void {
    const filePath = this.trackedFiles.get(tabId);
    if (filePath) {
      this.deleteFile(filePath);
      this.trackedFiles.delete(tabId);
    }
  }

  /**
   * Clean up all tracked temp files.
   * Call this on app shutdown.
   */
  cleanupAll(): void {
    for (const filePath of this.trackedFiles.values()) {
      this.deleteFile(filePath);
    }
    this.trackedFiles.clear();
  }

  /**
   * Get the temp file path for a tab (if any).
   */
  getTempFilePath(tabId: string): string | undefined {
    return this.trackedFiles.get(tabId);
  }

  private deleteFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to delete temp file ${filePath}:`, error);
    }
  }
}

// Singleton instance
export const tempFileService = new TempFileService();
