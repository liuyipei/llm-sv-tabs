import type { IPCBridgeAPI } from '$lib/ipc-bridge';

export type FileType = 'text' | 'pdf' | 'image';

/**
 * Detect the file type based on MIME type and file extension.
 */
export function detectFileType(file: File): FileType {
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

/**
 * Process a single dropped file and open it in a new tab.
 */
export async function processDroppedFile(file: File, ipc: IPCBridgeAPI): Promise<void> {
  const fileType = detectFileType(file);
  const filePath = ipc?.getPathForFile?.(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const content = e.target?.result as string;
      try {
        await ipc.openNoteTab(Date.now(), file.name, content, fileType, filePath);
        resolve();
      } catch (error) {
        console.error('Failed to create tab for dropped file:', error);
        reject(error);
      }
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
 * Handle dragover event - prevents default to allow drop.
 */
export function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Handle drop event - processes all dropped files.
 */
export async function handleDrop(event: DragEvent, ipc: IPCBridgeAPI): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  // Process all files in parallel
  const fileArray = Array.from(files);
  const promises = fileArray.map(file => processDroppedFile(file, ipc));

  try {
    await Promise.all(promises);
  } catch (error) {
    console.error('Error processing dropped files:', error);
  }
}

/**
 * Create bound event handlers for a component.
 * Returns handlers that can be used directly in event bindings.
 */
export function createDropHandlers(ipc: IPCBridgeAPI) {
  return {
    onDragOver: handleDragOver,
    onDrop: (event: DragEvent) => handleDrop(event, ipc),
  };
}
