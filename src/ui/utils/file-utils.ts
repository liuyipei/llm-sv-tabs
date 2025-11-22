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
