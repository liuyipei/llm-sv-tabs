import { writable, get } from 'svelte/store';

export type Note = {
  id: number;
  title: string;
  body: string;
  selected: boolean;
  fileType?: 'text' | 'pdf' | 'image';
  mimeType?: string;
};

const STORAGE_KEY = 'llm-notes';

// Load initial notes from localStorage
function loadNotesFromStorage(): Note[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
  }
  return [];
}

// Create the notes store with localStorage persistence
function createNotesStore() {
  const { subscribe, set, update } = writable<Note[]>(loadNotesFromStorage());

  // Set up persistence subscription
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    subscribe(notes => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    });
  }

  return {
    subscribe,
    set,
    update,

    // Add a single note
    addNote: (note: Note) => {
      update(notes => [...notes, note]);
    },

    // Add multiple notes
    addNotes: (newNotes: Note[]) => {
      update(notes => [...notes, ...newNotes]);
    },

    // Update an existing note
    updateNote: (id: number, updates: Partial<Note>) => {
      update(notes => notes.map(note =>
        note.id === id ? { ...note, ...updates } : note
      ));
    },

    // Remove a note
    removeNote: (id: number) => {
      update(notes => notes.filter(note => note.id !== id));
    },

    // Get current notes value (snapshot)
    getNotes: () => get({ subscribe }),
  };
}

export const notes = createNotesStore();
