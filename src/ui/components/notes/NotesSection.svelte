<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import { detectFileType, separateFilesBySize, MAX_FILE_SIZE } from '$utils/file-utils';
  import UploadProgress from './UploadProgress.svelte';
  import UploadErrors from './UploadErrors.svelte';
  import LargeFileConfirmDialog from './LargeFileConfirmDialog.svelte';

  type Note = {
    id: number;
    title: string;
    body: string;
    selected: boolean;
    fileType?: 'text' | 'pdf' | 'image';
    mimeType?: string;
  };

  const ipc = getContext<IPCBridgeAPI>('ipc');
  let notes = writable<Note[]>([]);
  let isDragging = $state(false);

  // Upload state
  let showSizeConfirmDialog = $state(false);
  let uploadProgress = $state<{ current: number; total: number; fileName: string } | null>(null);
  let pendingLargeFiles: File[] = $state([]);
  let uploadErrors: string[] = $state([]);

  // Load notes from localStorage on mount
  onMount(() => {
    const stored = localStorage.getItem('llm-notes');
    if (stored) {
      try {
        notes.set(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load notes:', e);
      }
    }
  });

  // Save notes to localStorage whenever they change
  notes.subscribe(n => {
    localStorage.setItem('llm-notes', JSON.stringify(n));
  });

  // ========== Note Management ==========

  function formatCurrentTime(): string {
    return new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\//g, '-').replace(',', '');
  }

  async function createNewNote(): Promise<void> {
    if (!ipc) return;

    const noteId = Date.now();
    const title = formatCurrentTime();
    const content = '';

    try {
      await ipc.openNoteTab(noteId, title, content, 'text');
    } catch (error) {
      console.error('Failed to create note tab:', error);
    }
  }

  // ========== File Upload Handling ==========

  async function handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      await processMultipleFiles(Array.from(files));
    }
    input.value = '';
  }

  async function processMultipleFiles(files: File[]): Promise<void> {
    uploadErrors = [];

    const { normalFiles, largeFiles } = separateFilesBySize(files, MAX_FILE_SIZE);

    if (largeFiles.length > 0) {
      pendingLargeFiles = largeFiles;
      showSizeConfirmDialog = true;
      if (normalFiles.length > 0) {
        await processFilesInParallel(normalFiles);
      }
      return;
    }

    await processFilesInParallel(files);
  }

  async function processFilesInParallel(files: File[]): Promise<void> {
    if (files.length === 0) return;

    uploadProgress = { current: 0, total: files.length, fileName: '' };

    const promises = files.map(async (file, index) => {
      try {
        uploadProgress = { current: index + 1, total: files.length, fileName: file.name };
        await processFile(file);
      } catch (error) {
        uploadErrors = [...uploadErrors, `Failed to upload ${file.name}: ${error}`];
        console.error(`Error processing file ${file.name}:`, error);
      }
    });

    await Promise.all(promises);

    uploadProgress = null;

    if (uploadErrors.length > 0) {
      setTimeout(() => {
        uploadErrors = [];
      }, 5000);
    }
  }

  async function processFile(file: File): Promise<void> {
    const fileType = detectFileType(file);
    const reader = new FileReader();
    // Use Electron's webUtils.getPathForFile() exposed via preload to get the absolute file path
    const filePath = ipc?.getPathForFile?.(file);

    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const newNote: Note = {
        id: Date.now(),
        title: file.name,
        body: content,
        selected: false,
        fileType,
        mimeType: file.type,
      };
      notes.update(n => [...n, newNote]);

      if (ipc) {
        try {
          await ipc.openNoteTab(newNote.id, newNote.title, newNote.body, fileType, filePath);
        } catch (error) {
          console.error('Failed to create tab for uploaded file:', error);
        }
      }
    };

    if (fileType === 'image' || fileType === 'pdf') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  // ========== Drag and Drop Handling ==========

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    isDragging = false;
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await processMultipleFiles(Array.from(files));
    }
  }

  // ========== Large File Confirmation ==========

  async function confirmLargeFileUpload(): Promise<void> {
    if (pendingLargeFiles.length > 0) {
      await processFilesInParallel(pendingLargeFiles);
      pendingLargeFiles = [];
    }
    showSizeConfirmDialog = false;
  }

  function cancelLargeFileUpload(): void {
    pendingLargeFiles = [];
    showSizeConfirmDialog = false;
  }

  // ========== Screenshot Handling ==========

  async function handleScreenshotClick(): Promise<void> {
    if (!ipc) return;

    try {
      const result = await ipc.triggerScreenshot();
      if (!result.success) {
        console.error('Screenshot failed:', result.error);
        uploadErrors = [...uploadErrors, result.error || 'Screenshot failed'];
      }
    } catch (error) {
      console.error('Screenshot error:', error);
      uploadErrors = [...uploadErrors, 'Screenshot error: ' + String(error)];
    }
  }
</script>

<div class="notes-section">
  <div class="notes-header">
    <h2>Notes & Files</h2>
  </div>

  <div class="notes-actions">
    <button onclick={createNewNote} class="action-btn">
      + New Note
    </button>
    <button onclick={handleScreenshotClick} class="action-btn screenshot-btn" title="Capture screen region (Ctrl+Alt+S)">
      📸 Screenshot
    </button>
    <label class="action-btn upload-btn">
      Upload File
      <input type="file" multiple onchange={handleFileUpload} style="display: none;" />
    </label>
  </div>

  <div
    class="drop-zone"
    class:dragging={isDragging}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
    aria-label="File drop zone for uploading files"
  >
    <p class="drop-zone-text">Drag and drop files here or use the buttons above</p>
    <p class="drop-zone-hint">Support for multiple files - each will open in a new tab</p>
  </div>

  {#if uploadProgress}
    <UploadProgress
      current={uploadProgress.current}
      total={uploadProgress.total}
      fileName={uploadProgress.fileName}
    />
  {/if}

  <UploadErrors errors={uploadErrors} />

  {#if showSizeConfirmDialog && pendingLargeFiles.length > 0}
    <LargeFileConfirmDialog
      files={pendingLargeFiles}
      onconfirm={confirmLargeFileUpload}
      oncancel={cancelLargeFileUpload}
    />
  {/if}
</div>

<style>
  .notes-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .notes-header {
    padding: var(--space-7);
    border-bottom: 1px solid var(--border-color);
  }

  h2 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-primary);
  }

  .notes-actions {
    display: flex;
    gap: var(--space-5);
    padding: var(--space-7);
    border-bottom: 1px solid var(--border-color);
  }

  .action-btn {
    flex: 1;
    background-color: var(--accent-color);
    color: var(--text-bright);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-6);
    font-size: var(--text-md);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .action-btn:hover,
  .action-btn:focus-visible {
    background-color: var(--accent-hover);
    outline: none;
  }

  .screenshot-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .screenshot-btn:hover,
  .screenshot-btn:focus-visible {
    background: linear-gradient(135deg, #5568d3 0%, #6a3f8e 100%);
  }

  .upload-btn {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .drop-zone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px var(--space-9);
    transition: background-color var(--transition-fast), border var(--transition-fast);
    position: relative;
    background-color: var(--bg-primary);
    border: 2px dashed var(--border-color);
    margin: var(--space-5);
    border-radius: var(--radius-lg);
  }

  .drop-zone.dragging {
    background-color: var(--bg-active);
    border-color: var(--accent-color);
  }

  .drop-zone-text {
    color: var(--text-primary);
    font-size: var(--text-base);
    margin: 0 0 var(--space-4) 0;
    font-weight: var(--font-medium);
  }

  .drop-zone-hint {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
