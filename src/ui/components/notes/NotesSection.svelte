<script lang="ts">
  import { getContext } from 'svelte';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import { processAndPersistFiles, processConfirmedFiles } from '$utils/file-utils';
  import { notes, type Note } from '$stores/notes';
  import UploadProgress from './UploadProgress.svelte';
  import UploadErrors from './UploadErrors.svelte';
  import LargeFileConfirmDialog from './LargeFileConfirmDialog.svelte';

  const ipc = getContext<IPCBridgeAPI>('ipc');
  let editingNote: Note | null = $state(null);
  let isDragging = $state(false);

  // Upload state
  let showSizeConfirmDialog = $state(false);
  let uploadProgress = $state<{ current: number; total: number; fileName: string } | null>(null);
  let pendingLargeFiles: File[] = $state([]);
  let uploadErrors: string[] = $state([]);

  // ========== Note Management ==========

  function createNewNote(): void {
    const newNote: Note = {
      id: Date.now(),
      title: 'New Note',
      body: '',
      selected: false,
    };
    notes.addNote(newNote);
    editingNote = newNote;
  }

  async function saveNote(): Promise<void> {
    if (!editingNote || !ipc) return;

    notes.updateNote(editingNote.id, editingNote);

    try {
      await ipc.openNoteTab(
        editingNote.id,
        editingNote.title,
        editingNote.body,
        editingNote.fileType || 'text'
      );
    } catch (error) {
      console.error('Failed to create tab for note:', error);
    }

    editingNote = null;
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
    uploadProgress = { current: 0, total: files.length, fileName: '' };

    const { largeFiles, errors } = await processAndPersistFiles(files, ipc, {
      onProgress: (current, total, fileName) => {
        uploadProgress = { current, total, fileName };
      },
      onError: (fileName, error) => {
        uploadErrors = [...uploadErrors, `Failed to upload ${fileName}: ${error}`];
      },
    });

    uploadProgress = null;

    // Handle large files that need confirmation
    if (largeFiles.length > 0) {
      pendingLargeFiles = largeFiles;
      showSizeConfirmDialog = true;
    }

    // Show errors temporarily
    if (errors.length > 0) {
      uploadErrors = [...uploadErrors, ...errors];
      setTimeout(() => {
        uploadErrors = [];
      }, 5000);
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
      uploadProgress = { current: 0, total: pendingLargeFiles.length, fileName: '' };

      const errors = await processConfirmedFiles(pendingLargeFiles, ipc, {
        onProgress: (current, total, fileName) => {
          uploadProgress = { current, total, fileName };
        },
      });

      uploadProgress = null;
      pendingLargeFiles = [];

      if (errors.length > 0) {
        uploadErrors = [...uploadErrors, ...errors];
        setTimeout(() => {
          uploadErrors = [];
        }, 5000);
      }
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

  {#if editingNote}
    <div class="note-editor">
      <input
        type="text"
        bind:value={editingNote.title}
        class="note-title-input"
        placeholder="Note title..."
      />
      <textarea
        bind:value={editingNote.body}
        class="note-body-input"
        placeholder="Note content..."
        rows="10"
      ></textarea>
      <div class="editor-actions">
        <button onclick={saveNote} class="save-btn">Save</button>
        <button onclick={() => editingNote = null} class="cancel-btn">Cancel</button>
      </div>
    </div>
  {:else}
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
  {/if}

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
    padding: 15px;
    border-bottom: 1px solid #3e3e42;
  }

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #cccccc;
  }

  .notes-actions {
    display: flex;
    gap: 10px;
    padding: 15px;
    border-bottom: 1px solid #3e3e42;
  }

  .action-btn {
    flex: 1;
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .action-btn:hover {
    background-color: #005a9e;
  }

  .screenshot-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .screenshot-btn:hover {
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
    padding: 40px 20px;
    transition: background-color 0.2s, border 0.2s;
    position: relative;
    background-color: #1e1e1e;
    border: 2px dashed #3e3e42;
    margin: 10px;
    border-radius: 8px;
  }

  .drop-zone.dragging {
    background-color: #094771;
    border-color: #007acc;
  }

  .drop-zone-text {
    color: #d4d4d4;
    font-size: 14px;
    margin: 0 0 8px 0;
    font-weight: 500;
  }

  .drop-zone-hint {
    color: #808080;
    font-size: 12px;
    margin: 0;
  }

  .note-editor {
    display: flex;
    flex-direction: column;
    padding: 15px;
    gap: 10px;
    overflow-y: auto;
  }

  .note-title-input {
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 10px;
    font-family: inherit;
    font-size: 16px;
    font-weight: 500;
  }

  .note-title-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .note-body-input {
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 10px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    resize: vertical;
    min-height: 200px;
  }

  .note-body-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .editor-actions {
    display: flex;
    gap: 10px;
  }

  .save-btn, .cancel-btn {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .save-btn {
    background-color: #007acc;
    color: white;
  }

  .save-btn:hover {
    background-color: #005a9e;
  }

  .cancel-btn {
    background-color: #3e3e42;
    color: #d4d4d4;
  }

  .cancel-btn:hover {
    background-color: #4e4e52;
  }
</style>
