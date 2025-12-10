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

// Quick-switch model list (provider:model format strings)
export type QuickSwitchModel = {
  provider: ProviderType;
  model: string;
};
export const quickSwitchModels = createPersistedStore<QuickSwitchModel[]>('quickSwitchModels', []);
// Currently selected quick-switch model (null means none selected)
export const selectedQuickSwitchIndex = createPersistedStore<number | null>('selectedQuickSwitchIndex', null);

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

// Quick-switch model helpers

// Add a model to the quick-switch list (moves to top if already exists)
// Returns: { added: boolean, movedToTop: boolean }
export function addQuickSwitchModel(providerName: ProviderType, modelName: string): { added: boolean; movedToTop: boolean } {
  let result = { added: false, movedToTop: false };

  quickSwitchModels.update((models) => {
    const existingIndex = models.findIndex(
      m => m.provider === providerName && m.model === modelName
    );

    if (existingIndex === 0) {
      // Already at top, no change needed
      return models;
    }

    if (existingIndex > 0) {
      // Move to top
      result.movedToTop = true;
      const [existing] = models.splice(existingIndex, 1);
      return [existing, ...models];
    }

    // Add new at top
    result.added = true;
    return [{ provider: providerName, model: modelName }, ...models];
  });

  return result;
}

// Remove a model from the quick-switch list by index
export function removeQuickSwitchModel(index: number): void {
  quickSwitchModels.update((models) => {
    const newModels = [...models];
    newModels.splice(index, 1);
    return newModels;
  });

  // Adjust selected index if needed
  selectedQuickSwitchIndex.update((currentIndex) => {
    if (currentIndex === null) return null;
    if (currentIndex === index) return null; // Removed the selected one
    if (currentIndex > index) return currentIndex - 1; // Shift down
    return currentIndex;
  });
}

// Get the currently selected quick-switch model
export function getSelectedQuickSwitchModel(
  models: QuickSwitchModel[],
  index: number | null
): QuickSwitchModel | null {
  if (index === null || index < 0 || index >= models.length) {
    return null;
  }
  return models[index];
}

// Truncate a long model name to show prefix...suffix
// e.g., "accounts/fireworks/models/llama-v3p3-70b-instruct" → "accounts/...70b-instruct"
export function truncateModelName(name: string, maxLength: number = 40): string {
  if (name.length <= maxLength) {
    return name;
  }

  // Reserve space for the ellipsis (3 chars)
  const available = maxLength - 3;
  // Show more of the suffix (end) since that's usually the unique part
  const prefixLen = Math.floor(available * 0.35);
  const suffixLen = available - prefixLen;

  const prefix = name.slice(0, prefixLen);
  const suffix = name.slice(-suffixLen);

  return `${prefix}...${suffix}`;
}

// Format a quick-switch model for display
export function formatQuickSwitchModel(item: QuickSwitchModel): string {
  return `${item.provider}:${item.model}`;
}

// Format a quick-switch model for display with truncation
export function formatQuickSwitchModelTruncated(item: QuickSwitchModel, maxModelLen: number = 40): string {
  const truncatedModel = truncateModelName(item.model, maxModelLen);
  return `${item.provider}:${truncatedModel}`;
}
