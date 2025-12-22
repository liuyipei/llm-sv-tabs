/**
 * Model Capabilities Cache
 *
 * Handles caching of probed model capabilities with precedence logic:
 * 1. Local overrides (highest priority)
 * 2. Probed cache
 * 3. Static overrides
 * 4. Provider defaults (lowest priority)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ProviderType } from '../types';
import type {
  ProbedCapabilities,
  CachedModelCapabilities,
  ModelCapabilitiesCache,
  ModelProbeResult,
  StaticCapabilityOverride,
} from './types';
import { getDefaultCapabilities } from './inference';

const CACHE_VERSION = '1.0.0';
const CACHE_FILE_NAME = 'model-capabilities.probed.json';

// ============================================================================
// Cache Key
// ============================================================================

/**
 * Create a cache key from provider and model
 */
export function makeCacheKey(provider: ProviderType, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Parse a cache key into provider and model
 */
export function parseCacheKey(key: string): { provider: ProviderType; model: string } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;

  const provider = key.slice(0, colonIndex) as ProviderType;
  const model = key.slice(colonIndex + 1);

  return { provider, model };
}

// ============================================================================
// Static Overrides
// ============================================================================

/**
 * Known static capability overrides for specific models
 */
const STATIC_OVERRIDES: StaticCapabilityOverride[] = [
  // OpenAI vision models
  {
    pattern: /^gpt-4o/,
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsPdfNative: false,
      supportsPdfAsImages: true,
      requiresBase64Images: false,
      requiresImagesFirst: false,
      messageShape: 'openai.parts',
    },
  },
  {
    pattern: /^gpt-4-vision/,
    provider: 'openai',
    capabilities: {
      supportsVision: true,
      supportsPdfNative: false,
      supportsPdfAsImages: true,
      requiresBase64Images: false,
      messageShape: 'openai.parts',
    },
  },
  // Anthropic Claude models
  {
    pattern: /^claude-3/,
    provider: 'anthropic',
    capabilities: {
      supportsVision: true,
      supportsPdfNative: true,
      supportsPdfAsImages: true,
      requiresBase64Images: true,
      requiresImagesFirst: false,
      messageShape: 'anthropic.content',
    },
  },
  // Gemini models
  {
    pattern: /^gemini/,
    provider: 'gemini',
    capabilities: {
      supportsVision: true,
      supportsPdfNative: false,
      supportsPdfAsImages: true,
      requiresBase64Images: false,
      messageShape: 'gemini.parts',
    },
  },
  // xAI Grok models
  {
    pattern: /^grok/,
    provider: 'xai',
    capabilities: {
      supportsVision: true,
      supportsPdfNative: false,
      supportsPdfAsImages: true,
      messageShape: 'openai.parts',
    },
  },
  // Ollama vision models
  {
    pattern: /llava|vision|bakllava/i,
    provider: 'ollama',
    capabilities: {
      supportsVision: true,
      supportsPdfAsImages: true,
      messageShape: 'openai.parts',
    },
  },
];

/**
 * Get static override for a model
 */
export function getStaticOverride(
  provider: ProviderType,
  model: string
): Partial<ProbedCapabilities> | null {
  for (const override of STATIC_OVERRIDES) {
    // Check provider match (if specified)
    if (override.provider && override.provider !== provider) {
      continue;
    }

    // Check pattern match
    const pattern = override.pattern instanceof RegExp
      ? override.pattern
      : new RegExp(`^${override.pattern}$`);

    if (pattern.test(model)) {
      return override.capabilities;
    }
  }

  return null;
}

// ============================================================================
// Provider Defaults
// ============================================================================

/**
 * Default capabilities by provider
 */
const PROVIDER_DEFAULTS: Record<ProviderType, Partial<ProbedCapabilities>> = {
  openai: {
    supportsVision: false, // Default to false, specific models override
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  anthropic: {
    supportsVision: true,
    supportsPdfNative: true,
    supportsPdfAsImages: true,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'anthropic.content',
    completionShape: 'anthropic.sse',
  },
  gemini: {
    supportsVision: true,
    supportsPdfNative: false,
    supportsPdfAsImages: true,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'gemini.parts',
    completionShape: 'gemini.streaming',
  },
  xai: {
    supportsVision: true,
    supportsPdfNative: false,
    supportsPdfAsImages: true,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  openrouter: {
    supportsVision: false, // Depends on underlying model
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  fireworks: {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  ollama: {
    supportsVision: false, // Depends on model
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  lmstudio: {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  vllm: {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
  minimax: {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: false,
    requiresImagesFirst: false,
    messageShape: 'openai.string',
    completionShape: 'openai.streaming',
  },
  'local-openai-compatible': {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  },
};

/**
 * Get provider default capabilities
 */
export function getProviderDefaults(provider: ProviderType): Partial<ProbedCapabilities> {
  return PROVIDER_DEFAULTS[provider] || {};
}

// ============================================================================
// In-Memory Cache
// ============================================================================

let memoryCache: ModelCapabilitiesCache | null = null;
let localOverrides: Map<string, Partial<ProbedCapabilities>> = new Map();

/**
 * Initialize the cache
 */
export function initializeCache(cache?: ModelCapabilitiesCache): void {
  if (cache) {
    memoryCache = cache;
  } else {
    memoryCache = {
      version: CACHE_VERSION,
      lastUpdated: Date.now(),
      models: {},
    };
  }
}

/**
 * Get the current cache
 */
export function getCache(): ModelCapabilitiesCache {
  if (!memoryCache) {
    initializeCache();
  }
  return memoryCache!;
}

/**
 * Set a local override (highest priority)
 */
export function setLocalOverride(
  provider: ProviderType,
  model: string,
  capabilities: Partial<ProbedCapabilities>
): void {
  const key = makeCacheKey(provider, model);
  localOverrides.set(key, capabilities);
}

/**
 * Remove a local override
 */
export function removeLocalOverride(provider: ProviderType, model: string): void {
  const key = makeCacheKey(provider, model);
  localOverrides.delete(key);
}

/**
 * Clear all local overrides
 */
export function clearLocalOverrides(): void {
  localOverrides.clear();
}

// ============================================================================
// Capability Resolution (with precedence)
// ============================================================================

/**
 * Get capabilities for a model with full precedence chain
 * Priority: Local override > Probed cache > Static override > Provider default
 */
export function getCapabilities(
  provider: ProviderType,
  model: string
): ProbedCapabilities {
  const key = makeCacheKey(provider, model);
  const defaults = getDefaultCapabilities();

  // Start with provider defaults
  let result: ProbedCapabilities = {
    ...defaults,
    ...getProviderDefaults(provider),
  };

  // Apply static override if exists
  const staticOverride = getStaticOverride(provider, model);
  if (staticOverride) {
    result = { ...result, ...staticOverride };
  }

  // Apply probed cache if exists
  const cached = memoryCache?.models[key];
  if (cached) {
    result = { ...result, ...cached.capabilities };
  }

  // Apply local override if exists (highest priority)
  const localOverride = localOverrides.get(key);
  if (localOverride) {
    result = { ...result, ...localOverride };
  }

  return result;
}

/**
 * Get the source of capabilities for a model
 */
export function getCapabilitySource(
  provider: ProviderType,
  model: string
): 'local-override' | 'probed' | 'static-override' | 'provider-default' {
  const key = makeCacheKey(provider, model);

  if (localOverrides.has(key)) {
    return 'local-override';
  }

  if (memoryCache?.models[key]) {
    return 'probed';
  }

  if (getStaticOverride(provider, model)) {
    return 'static-override';
  }

  return 'provider-default';
}

// ============================================================================
// Cache Updates
// ============================================================================

/**
 * Update cache with probe results
 */
export function updateCacheFromProbeResult(result: ModelProbeResult): void {
  const key = makeCacheKey(result.provider, result.model);
  const cache = getCache();

  cache.models[key] = {
    provider: result.provider,
    model: result.model,
    capabilities: result.capabilities,
    lastProbedAt: result.probedAt,
    probeVersion: result.probeVersion,
    source: 'probed',
  };

  cache.lastUpdated = Date.now();
}

/**
 * Update cache with multiple probe results
 */
export function updateCacheFromProbeResults(results: ModelProbeResult[]): void {
  for (const result of results) {
    updateCacheFromProbeResult(result);
  }
}

/**
 * Remove a model from the cache
 */
export function removeCachedModel(provider: ProviderType, model: string): void {
  const key = makeCacheKey(provider, model);
  const cache = getCache();
  delete cache.models[key];
  cache.lastUpdated = Date.now();
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  memoryCache = {
    version: CACHE_VERSION,
    lastUpdated: Date.now(),
    models: {},
  };
}

// ============================================================================
// File I/O
// ============================================================================

/**
 * Get the default cache file path
 */
export function getDefaultCachePath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.llm-tabs', CACHE_FILE_NAME);
}

/**
 * Load cache from a file
 */
export async function loadCacheFromFile(filePath?: string): Promise<ModelCapabilitiesCache | null> {
  const targetPath = filePath || getDefaultCachePath();

  try {
    const content = await fs.readFile(targetPath, 'utf-8');
    const cache = JSON.parse(content) as ModelCapabilitiesCache;

    // Validate version
    if (cache.version !== CACHE_VERSION) {
      console.warn(`Cache version mismatch: ${cache.version} vs ${CACHE_VERSION}`);
      return null;
    }

    initializeCache(cache);
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist, not an error
    }
    console.error('Failed to load cache:', error);
    return null;
  }
}

/**
 * Save cache to a file
 */
export async function saveCacheToFile(filePath?: string): Promise<void> {
  const targetPath = filePath || getDefaultCachePath();
  const cache = getCache();

  // Ensure directory exists
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  // Write cache
  await fs.writeFile(targetPath, JSON.stringify(cache, null, 2), 'utf-8');
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get statistics about the cache
 */
export function getCacheStats(): {
  modelCount: number;
  lastUpdated: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  providerBreakdown: Record<ProviderType, number>;
} {
  const cache = getCache();
  const entries = Object.values(cache.models);

  const providerBreakdown: Partial<Record<ProviderType, number>> = {};
  let oldestEntry: number | null = null;
  let newestEntry: number | null = null;

  for (const entry of entries) {
    // Count by provider
    providerBreakdown[entry.provider] = (providerBreakdown[entry.provider] || 0) + 1;

    // Track oldest/newest
    if (oldestEntry === null || entry.lastProbedAt < oldestEntry) {
      oldestEntry = entry.lastProbedAt;
    }
    if (newestEntry === null || entry.lastProbedAt > newestEntry) {
      newestEntry = entry.lastProbedAt;
    }
  }

  return {
    modelCount: entries.length,
    lastUpdated: cache.lastUpdated,
    oldestEntry,
    newestEntry,
    providerBreakdown: providerBreakdown as Record<ProviderType, number>,
  };
}
