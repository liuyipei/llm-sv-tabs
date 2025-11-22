<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  type Note = {
    id: number;
    title: string;
    body: string;
    selected: boolean;
  };

  const ipc = getContext<IPCBridgeAPI>('ipc');
  let notes = writable<Note[]>([]);
  let editingNote: Note | null = $state(null);
  let isDragging = $state(false);
  let showSizeConfirmDialog = $state(false);
  let pendingLargeFile: File | null = $state(null);

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
        await ipc.openNoteTab(editingNote.id, editingNote.title, editingNote.body);
      } catch (error) {
        console.error('Failed to create tab for note:', error);
      }

      editingNote = null;
    }
  }

  async function handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files) {
      for (const file of Array.from(files)) {
        await processFile(file);
      }
    }
    // Reset input value to allow uploading the same file again
    input.value = '';
  }

  async function processFile(file: File, skipSizeCheck = false): Promise<void> {
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB in bytes

    // Check file size
    if (!skipSizeCheck && file.size > MAX_SIZE) {
      pendingLargeFile = file;
      showSizeConfirmDialog = true;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const newNote: Note = {
        id: Date.now(),
        title: file.name,
        body: content,
        selected: false,
      };
      notes.update(n => [...n, newNote]);

      // Create a tab for the uploaded file
      if (ipc) {
        try {
          await ipc.openNoteTab(newNote.id, newNote.title, newNote.body);
        } catch (error) {
          console.error('Failed to create tab for uploaded file:', error);
        }
      }
    };
    reader.readAsText(file);
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
    if (files) {
      for (const file of Array.from(files)) {
        await processFile(file);
      }
    }
  }

  function confirmLargeFileUpload(): void {
    if (pendingLargeFile) {
      processFile(pendingLargeFile, true);
      pendingLargeFile = null;
    }
    showSizeConfirmDialog = false;
  }

  function cancelLargeFileUpload(): void {
    pendingLargeFile = null;
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
      class="notes-list"
      class:dragging={isDragging}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      {#each $notes as note (note.id)}
        <div class="note-item" class:selected={note.selected}>
          <input
            type="checkbox"
            checked={note.selected}
            onchange={() => toggleNoteSelection(note)}
            title="Include in context"
          />
          <div
            class="note-info"
            onclick={() => editNote(note)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && editNote(note)}
            role="button"
            tabindex="0"
          >
            <div class="note-title">{note.title}</div>
            <div class="note-preview">{note.body.slice(0, 50)}{note.body.length > 50 ? '...' : ''}</div>
          </div>
          <button class="delete-btn" onclick={() => deleteNote(note.id)} title="Delete note">
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if showSizeConfirmDialog && pendingLargeFile}
    <div class="modal-overlay" onclick={cancelLargeFileUpload}>
      <div class="modal-content" onclick={(e) => e.stopPropagation()}>
        <h3>Large File Warning</h3>
        <p>
          The file <strong>{pendingLargeFile.name}</strong> is {formatFileSize(pendingLargeFile.size)}.
        </p>
        <p>This exceeds the recommended size limit of 50 MB. Do you want to continue?</p>
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

  .notes-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    transition: background-color 0.2s;
    position: relative;
  }

  .notes-list.dragging {
    background-color: #094771;
    border: 2px dashed #007acc;
  }

  .notes-list.dragging::before {
    content: 'Drop files here';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #007acc;
    font-size: 16px;
    font-weight: 600;
    pointer-events: none;
    z-index: 1;
  }

  .note-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    margin-bottom: 5px;
    background-color: #2d2d30;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .note-item:hover {
    background-color: #3e3e42;
  }

  .note-item.selected {
    background-color: #094771;
    border-left: 3px solid #007acc;
  }

  .note-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .note-title {
    font-size: 13px;
    font-weight: 500;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .note-preview {
    font-size: 11px;
    color: #808080;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #d4d4d4;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.2s;
  }

  .delete-btn:hover {
    opacity: 1;
    background-color: #e81123;
  }

  input[type='checkbox'] {
    flex-shrink: 0;
    cursor: pointer;
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
</style>
