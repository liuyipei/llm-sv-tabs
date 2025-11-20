import { writable, type Writable } from 'svelte/store';
import type { ProviderType } from '../../types';

// Create a persisted store that syncs with localStorage
function createPersistedStore<T>(key: string, initial: T): Writable<T> {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  const stored = isBrowser ? localStorage.getItem(key) : null;
  const store = writable<T>(stored ? JSON.parse(stored) : initial);

  // Subscribe to changes and persist to localStorage
  if (isBrowser) {
    store.subscribe((value) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

// Configuration stores
export const provider = createPersistedStore<ProviderType>('provider', 'openai');
export const model = createPersistedStore<string | null>('model', null);
export const apiKeys = createPersistedStore<Record<string, string>>('apiKeys', {});
export const maxTokens = createPersistedStore<number>('maxTokens', 2000);
export const temperature = createPersistedStore<number>('temperature', 0.7);
export const systemPrompt = createPersistedStore<string>('systemPrompt', '');
export const endpoint = createPersistedStore<string>('endpoint', '');

// Helper functions
export function setApiKey(providerName: ProviderType, key: string): void {
  apiKeys.update((keys) => {
    keys[providerName] = key;
    return { ...keys };
  });
}

export function getApiKey(providerName: ProviderType, currentKeys: Record<string, string>): string | undefined {
  return currentKeys[providerName];
}
