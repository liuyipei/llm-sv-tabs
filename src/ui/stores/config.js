import { writable } from 'svelte/store';

// Create a persisted store that syncs with localStorage
function createPersistedStore(key, initial) {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  const stored = isBrowser ? localStorage.getItem(key) : null;
  const store = writable(stored ? JSON.parse(stored) : initial);

  // Subscribe to changes and persist to localStorage
  if (isBrowser) {
    store.subscribe((value) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

// Configuration stores
export const provider = createPersistedStore('provider', 'openai');
export const model = createPersistedStore('model', null);
export const apiKeys = createPersistedStore('apiKeys', {});
export const maxTokens = createPersistedStore('maxTokens', 2000);
export const temperature = createPersistedStore('temperature', 0.7);
export const systemPrompt = createPersistedStore('systemPrompt', '');
