<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

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
  let editingNote: Note | null = $state(null);
  let isDragging = $state(false);
  let showSizeConfirmDialog = $state(false);
  let pendingLargeFile: File | null = $state(null);
  let uploadProgress = $state<{ current: number; total: number; fileName: string } | null>(null);
  let pendingLargeFiles: File[] = $state([]);
  let uploadErrors: string[] = $state([]);

  // Load notes from localStorage on mount
  onMount(() => {
    const stored = localStorage.getItem('llm-notes');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        notes.set(parsed);
      } catch (e) {
        console.error('Failed to load notes:', e);
      }
    }
  });

  // Save notes to localStorage whenever they change
  notes.subscribe(n => {
    localStorage.setItem('llm-notes', JSON.stringify(n));
  });

  function createNewNote(): void {
    const newNote: Note = {
      id: Date.now(),
      title: 'New Note',
      body: '',
      selected: false,
    };
    notes.update(n => [...n, newNote]);
    editingNote = newNote;
  }

  function toggleNoteSelection(note: Note): void {
    notes.update(n => n.map(item =>
      item.id === note.id ? { ...item, selected: !item.selected } : item
    ));
  }

  async function deleteNote(noteId: number): Promise<void> {
    notes.update(n => n.filter(item => item.id !== noteId));
    if (editingNote?.id === noteId) {
      editingNote = null;
    }
  }

  function editNote(note: Note): void {
    editingNote = note;
  }

  async function saveNote(): Promise<void> {
    if (editingNote && ipc) {
      // Update the note in the list
      notes.update(n => n.map(item =>
        item.id === editingNote!.id ? { ...editingNote! } : item
      ));

      // Create a tab for this note
      try {
        await ipc.openNoteTab(editingNote.id, editingNote.title, editingNote.body, editingNote.fileType || 'text');
      } catch (error) {
        console.error('Failed to create tab for note:', error);
      }

      editingNote = null;
    }
  }

  async function handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      await processMultipleFiles(Array.from(files));
    }
    // Reset input value to allow uploading the same file again
    input.value = '';
  }

  async function processMultipleFiles(files: File[]): Promise<void> {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB in bytes

    // Reset errors
    uploadErrors = [];

    // Separate files into normal and large files
    const normalFiles: File[] = [];
    const largeFiles: File[] = [];

    for (const file of files) {
      if (file.size > MAX_SIZE) {
        largeFiles.push(file);
      } else {
        normalFiles.push(file);
      }
    }

    // If there are large files, show confirmation dialog
    if (largeFiles.length > 0) {
      pendingLargeFiles = largeFiles;
      showSizeConfirmDialog = true;
      // Process normal files first
      if (normalFiles.length > 0) {
        await processFilesInParallel(normalFiles);
      }
      return;
    }

    // Process all files
    await processFilesInParallel(files);
  }

  async function processFilesInParallel(files: File[]): Promise<void> {
    if (files.length === 0) return;

    // Show progress
    uploadProgress = { current: 0, total: files.length, fileName: '' };

    // Process files in parallel
    const promises = files.map(async (file, index) => {
      try {
        uploadProgress = { current: index + 1, total: files.length, fileName: file.name };
        await processFile(file, true);
      } catch (error) {
        uploadErrors = [...uploadErrors, `Failed to upload ${file.name}: ${error}`];
        console.error(`Error processing file ${file.name}:`, error);
      }
    });

    await Promise.all(promises);

    // Clear progress
    uploadProgress = null;

    // Show errors if any
    if (uploadErrors.length > 0) {
      setTimeout(() => {
        uploadErrors = [];
      }, 5000);
    }
  }

  async function processFile(file: File, skipSizeCheck = false): Promise<void> {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB in bytes

    // Check file size
    if (!skipSizeCheck && file.size > MAX_SIZE) {
      pendingLargeFile = file;
      showSizeConfirmDialog = true;
      return;
    }

    // Detect file type based on MIME type
    const fileType = detectFileType(file);

    const reader = new FileReader();
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

      // Create a tab for the uploaded file
      if (ipc) {
        try {
          await ipc.openNoteTab(newNote.id, newNote.title, newNote.body, fileType);
        } catch (error) {
          console.error('Failed to create tab for uploaded file:', error);
        }
      }
    };

    // Use appropriate reader method based on file type
    if (fileType === 'image' || fileType === 'pdf') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  function detectFileType(file: File): 'text' | 'pdf' | 'image' {
    const mimeType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    // Check for images
    if (mimeType.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(fileName)) {
      return 'image';
    }

    // Check for PDFs
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'pdf';
    }

    // Default to text
    return 'text';
  }

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

  function formatFileSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
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
    >
      <p class="drop-zone-text">Drag and drop files here or use the buttons above</p>
      <p class="drop-zone-hint">Support for multiple files - each will open in a new tab</p>
    </div>
  {/if}

  {#if uploadProgress}
    <div class="upload-progress">
      <div class="progress-text">
        Uploading file {uploadProgress.current} of {uploadProgress.total}...
      </div>
      <div class="progress-filename">{uploadProgress.fileName}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {(uploadProgress.current / uploadProgress.total) * 100}%"></div>
      </div>
    </div>
  {/if}

  {#if uploadErrors.length > 0}
    <div class="upload-errors">
      {#each uploadErrors as error}
        <div class="error-message">{error}</div>
      {/each}
    </div>
  {/if}

  {#if showSizeConfirmDialog && pendingLargeFiles.length > 0}
    <div class="modal-overlay" onclick={cancelLargeFileUpload}>
      <div class="modal-content" onclick={(e) => e.stopPropagation()}>
        <h3>Large File Warning</h3>
        {#if pendingLargeFiles.length === 1}
          <p>
            The file <strong>{pendingLargeFiles[0].name}</strong> is {formatFileSize(pendingLargeFiles[0].size)}.
          </p>
          <p>This exceeds the recommended size limit of 50 MB. Do you want to continue?</p>
        {:else}
          <p>
            You are trying to upload <strong>{pendingLargeFiles.length} files</strong> that exceed the recommended size limit of 50 MB:
          </p>
          <ul class="large-files-list">
            {#each pendingLargeFiles as file}
              <li>{file.name} ({formatFileSize(file.size)})</li>
            {/each}
          </ul>
          <p>Do you want to continue?</p>
        {/if}
        <div class="modal-actions">
          <button onclick={confirmLargeFileUpload} class="confirm-btn">Upload Anyway</button>
          <button onclick={cancelLargeFileUpload} class="cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
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

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: #252526;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .modal-content h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #cccccc;
  }

  .modal-content p {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #d4d4d4;
    line-height: 1.5;
  }

  .modal-content p strong {
    color: #ffffff;
    word-break: break-all;
  }

  .modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  .modal-actions button {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .confirm-btn {
    background-color: #007acc;
    color: white;
  }

  .confirm-btn:hover {
    background-color: #005a9e;
  }

  .large-files-list {
    margin: 10px 0;
    padding-left: 20px;
    max-height: 200px;
    overflow-y: auto;
  }

  .large-files-list li {
    color: #d4d4d4;
    margin: 5px 0;
    font-size: 13px;
  }

  /* Upload progress styles */
  .upload-progress {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #252526;
    border: 1px solid #007acc;
    border-radius: 6px;
    padding: 15px 20px;
    min-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  .progress-text {
    color: #cccccc;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 5px;
  }

  .progress-filename {
    color: #808080;
    font-size: 12px;
    margin-bottom: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background-color: #3e3e42;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: #007acc;
    transition: width 0.3s ease;
  }

  /* Upload errors styles */
  .upload-errors {
    position: fixed;
    bottom: 20px;
    right: 20px;
    max-width: 400px;
    z-index: 1000;
  }

  .error-message {
    background-color: #5a1d1d;
    border: 1px solid #be1100;
    border-radius: 4px;
    padding: 12px 15px;
    margin-bottom: 10px;
    color: #f48771;
    font-size: 13px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
</style>
