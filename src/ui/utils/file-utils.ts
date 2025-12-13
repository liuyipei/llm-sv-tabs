import { notes, type Note } from '$stores/notes';
import type { IPCBridgeAPI } from '$lib/ipc-bridge';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

export function detectFileType(file: File): 'text' | 'pdf' | 'image' {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(fileName)) {
    return 'image';
  }

  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'text';
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(2) + ' MB';
}

export function isLargeFile(file: File, maxSize: number = MAX_FILE_SIZE): boolean {
  return file.size > maxSize;
}

export function separateFilesBySize(files: File[], maxSize: number = MAX_FILE_SIZE): {
  normalFiles: File[];
  largeFiles: File[];
} {
  const normalFiles: File[] = [];
  const largeFiles: File[] = [];

  for (const file of files) {
    if (file.size > maxSize) {
      largeFiles.push(file);
    } else {
      normalFiles.push(file);
    }
  }

  return { normalFiles, largeFiles };
}

/**
 * Read file content as a string (text or data URL for binary files)
 */
export function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileType = detectFileType(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    if (fileType === 'image' || fileType === 'pdf') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

/**
 * Process a single file: add to notes store and open as tab
 */
export async function processAndPersistFile(
  file: File,
  ipc: IPCBridgeAPI | null
): Promise<void> {
  const fileType = detectFileType(file);
  const content = await readFileContent(file);

  const newNote: Note = {
    id: Date.now() + Math.random(), // Ensure unique IDs for parallel processing
    title: file.name,
    body: content,
    selected: false,
    fileType,
    mimeType: file.type,
  };

  // Add to notes store (persists to localStorage)
  notes.addNote(newNote);

  // Open as tab
  if (ipc) {
    try {
      await ipc.openNoteTab(newNote.id, newNote.title, newNote.body, fileType);
    } catch (error) {
      console.error('Failed to create tab for file:', error);
    }
  }
}

export type FileProcessingCallbacks = {
  onProgress?: (current: number, total: number, fileName: string) => void;
  onError?: (fileName: string, error: unknown) => void;
  onComplete?: () => void;
};

/**
 * Process multiple files in parallel: add to notes store and open as tabs
 * Returns any files that exceed the size limit for user confirmation
 */
export async function processAndPersistFiles(
  files: File[],
  ipc: IPCBridgeAPI | null,
  callbacks?: FileProcessingCallbacks
): Promise<{ largeFiles: File[]; errors: string[] }> {
  const errors: string[] = [];

  // Separate large files that need confirmation
  const { normalFiles, largeFiles } = separateFilesBySize(files, MAX_FILE_SIZE);

  if (normalFiles.length === 0) {
    return { largeFiles, errors };
  }

  // Process normal files in parallel
  const promises = normalFiles.map(async (file, index) => {
    try {
      callbacks?.onProgress?.(index + 1, normalFiles.length, file.name);
      await processAndPersistFile(file, ipc);
    } catch (error) {
      const errorMsg = `Failed to upload ${file.name}: ${error}`;
      errors.push(errorMsg);
      callbacks?.onError?.(file.name, error);
      console.error(`Error processing file ${file.name}:`, error);
    }
  });

  await Promise.all(promises);
  callbacks?.onComplete?.();

  return { largeFiles, errors };
}

/**
 * Process files that have been confirmed by the user (e.g., large files)
 */
export async function processConfirmedFiles(
  files: File[],
  ipc: IPCBridgeAPI | null,
  callbacks?: FileProcessingCallbacks
): Promise<string[]> {
  const errors: string[] = [];

  if (files.length === 0) {
    return errors;
  }

  const promises = files.map(async (file, index) => {
    try {
      callbacks?.onProgress?.(index + 1, files.length, file.name);
      await processAndPersistFile(file, ipc);
    } catch (error) {
      const errorMsg = `Failed to upload ${file.name}: ${error}`;
      errors.push(errorMsg);
      callbacks?.onError?.(file.name, error);
      console.error(`Error processing file ${file.name}:`, error);
    }
  });

  await Promise.all(promises);
  callbacks?.onComplete?.();

  return errors;
}
