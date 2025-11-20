import { writable, type Writable } from 'svelte/store';
import type { ProviderType } from '../../types';

// Create a persisted store that syncs with localStorage
// Uses the custom store pattern to avoid subscribing during module init
function createPersistedStore<T>(key: string, initial: T): Writable<T> {
  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  // 1. Load initial value from localStorage
  let initialValue = initial;
  if (isBrowser) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        initialValue = JSON.parse(stored);
      } catch (e) {
        console.warn(`Failed to parse stored value for ${key}`, e);
      }
    }
  }

  // 2. Create the base writable store
  const { subscribe, set, update } = writable<T>(initialValue);

  // 3. Return a custom store object that persists on set/update
  return {
    subscribe,
    set: (value: T) => {
      if (isBrowser) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      set(value);
    },
    update: (fn: (value: T) => T) => {
      update((current) => {
        const newValue = fn(current);
        if (isBrowser) {
          localStorage.setItem(key, JSON.stringify(newValue));
        }
        return newValue;
      });
    }
  };
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
