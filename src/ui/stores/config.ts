import { writable, type Writable } from 'svelte/store';
import type { ProviderType, LLMModel } from '../../types';

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
export const systemPrompt = createPersistedStore<string>('systemPrompt', '');
export const endpoint = createPersistedStore<string>('endpoint', '');

// Model history stores
// Stores discovered models for each provider
export const discoveredModels = createPersistedStore<Record<string, LLMModel[]>>('discoveredModels', {});
// Stores the last selected model for each provider
export const selectedModelByProvider = createPersistedStore<Record<string, string>>('selectedModelByProvider', {});
// Stores models that have been used, with timestamp
export const modelUsageHistory = createPersistedStore<Array<{
  model: string;
  provider: ProviderType;
  timestamp: number;
}>>('modelUsageHistory', []);

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

// Save discovered models for a provider
export function saveDiscoveredModels(providerName: ProviderType, models: LLMModel[]): void {
  discoveredModels.update((allModels) => ({
    ...allModels,
    [providerName]: models,
  }));
}

// Get discovered models for a provider
export function getDiscoveredModels(providerName: ProviderType, allModels: Record<string, LLMModel[]>): LLMModel[] | undefined {
  return allModels[providerName];
}

// Record model usage
export function recordModelUsage(modelName: string, providerName: ProviderType): void {
  modelUsageHistory.update((history) => {
    // Add new usage record at the beginning
    const newHistory = [
      {
        model: modelName,
        provider: providerName,
        timestamp: Date.now(),
      },
      ...history,
    ];

    // Keep only last 100 usage records to avoid unbounded growth
    return newHistory.slice(0, 100);
  });
}

// Get recently used models
export function getRecentModels(history: Array<{ model: string; provider: ProviderType; timestamp: number }>, count = 10): Array<{ model: string; provider: ProviderType; timestamp: number }> {
  return history.slice(0, count);
}

// Save selected model for a provider
export function saveSelectedModelForProvider(providerName: ProviderType, modelName: string): void {
  selectedModelByProvider.update((models) => ({
    ...models,
    [providerName]: modelName,
  }));
}

// Get selected model for a provider
export function getSelectedModelForProvider(providerName: ProviderType, allModels: Record<string, string>): string | undefined {
  return allModels[providerName];
}
