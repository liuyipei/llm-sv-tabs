<script lang="ts">
  import { writable } from 'svelte/store';

  type Note = {
    id: number;
    title: string;
    body: string;
    selected: boolean;
  };

  let notes = writable<Note[]>([]);
  let editingNote: Note | null = $state(null);

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

  function deleteNote(noteId: number): void {
    notes.update(n => n.filter(item => item.id !== noteId));
    if (editingNote?.id === noteId) {
      editingNote = null;
    }
  }

  function editNote(note: Note): void {
    editingNote = note;
  }

  function saveNote(): void {
    if (editingNote) {
      notes.update(n => n.map(item =>
        item.id === editingNote!.id ? { ...editingNote! } : item
      ));
      editingNote = null;
    }
  }

  function handleFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newNote: Note = {
            id: Date.now(),
            title: file.name,
            body: content,
            selected: false,
          };
          notes.update(n => [...n, newNote]);
        };
        reader.readAsText(file);
      });
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
    <div class="notes-list">
      {#if $notes.length === 0}
        <div class="empty-state">
          <p>No notes yet. Create a new note or upload a file.</p>
        </div>
      {:else}
        {#each $notes as note (note.id)}
          <div class="note-item" class:selected={note.selected}>
            <input
              type="checkbox"
              checked={note.selected}
              onchange={() => toggleNoteSelection(note)}
              title="Include in context"
            />
            <div class="note-info" onclick={() => editNote(note)}>
              <div class="note-title">{note.title}</div>
              <div class="note-preview">{note.body.slice(0, 50)}{note.body.length > 50 ? '...' : ''}</div>
            </div>
            <button class="delete-btn" onclick={() => deleteNote(note.id)} title="Delete note">
              ×
            </button>
          </div>
        {/each}
      {/if}
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
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #808080;
    font-size: 13px;
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
</style>
