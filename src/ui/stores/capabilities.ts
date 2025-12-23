import { get, writable } from 'svelte/store';
import type { ProviderType } from '../../types';
import type { CachedModelCapabilities, ModelCapabilitiesCache } from '../../probe/types';

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache, synced with ~/.llm-tabs/model-capabilities.probed.json via IPC
export const modelCapabilities = writable<Map<string, CachedModelCapabilities>>(new Map());

function makeKey(provider: ProviderType, model: string): string {
  return `${provider}:${model}`;
}

export function setCapabilitiesFromCache(cache: ModelCapabilitiesCache): void {
  const entries = Object.entries(cache.models);
  modelCapabilities.set(new Map(entries));
}

export function updateCapability(entry: CachedModelCapabilities): void {
  modelCapabilities.update((current) => {
    const next = new Map(current);
    const key = makeKey(entry.provider, entry.model);
    next.set(key, entry);
    return next;
  });
}

export function getCapabilities(
  provider: ProviderType,
  model: string
): CachedModelCapabilities | undefined {
  const key = makeKey(provider, model);
  const current = get(modelCapabilities);
  return current.get(key);
}

export function isCapabilityStale(entry?: CachedModelCapabilities): boolean {
  if (!entry) return true;
  return Date.now() - entry.lastProbedAt > STALE_MS;
}

export async function loadCapabilitiesFromCache(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.loadCapabilityCache) return;

  try {
    const cache = await window.electronAPI.loadCapabilityCache();
    if (cache?.models) {
      setCapabilitiesFromCache(cache);
    }
  } catch (error) {
    console.warn('Failed to load capability cache from disk', error);
  }
}

export async function probeAndStoreCapabilities(
  provider: ProviderType,
  model: string,
  apiKey?: string,
  endpoint?: string,
  force = false
): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI?.probeModel) return;

  const existing = getCapabilities(provider, model);
  if (!force && existing && !isCapabilityStale(existing)) {
    return;
  }

  try {
    const result = await window.electronAPI.probeModel(provider, model, apiKey, endpoint);
    if (result?.capabilities) {
      updateCapability({
        provider,
        model,
        capabilities: result.capabilities,
        lastProbedAt: result.probedAt || Date.now(),
        probeVersion: result.probeVersion || 'unknown',
        source: 'probed',
      });
    }
  } catch (error) {
    console.warn(`Probe failed for ${provider}:${model}`, error);
  }
}
