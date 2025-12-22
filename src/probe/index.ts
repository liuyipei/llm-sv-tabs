/**
 * Model Capability Probing
 *
 * Active capability probing system for detecting LLM model features
 * (vision, PDF support, message formats, etc.) through live API tests.
 *
 * @example
 * ```typescript
 * import { probeModel, getCapabilities, updateCacheFromProbeResult } from './probe';
 *
 * // Probe a model
 * const result = await probeModel('openai', 'gpt-4o', apiKey, undefined, config);
 *
 * // Update cache
 * updateCacheFromProbeResult(result);
 *
 * // Get capabilities (with precedence chain)
 * const caps = getCapabilities('openai', 'gpt-4o');
 * if (caps.supportsVision) {
 *   // Include images in request
 * }
 * ```
 */

// Types
export type {
  ProbedCapabilities,
  ModelProbeResult,
  ProbeResult,
  ProbeWithRetryResult,
  ProbeVariant,
  ProbeConfig,
  CachedModelCapabilities,
  ModelCapabilitiesCache,
  QuickListModel,
  ApiKeyConfig,
  MessageShape,
  CompletionShape,
  StaticCapabilityOverride,
  ProbeTableRow,
  OutputFormat,
} from './types';

export { DEFAULT_PROBE_CONFIG } from './types';

// Inference
export {
  probeModel,
  probeModels,
  getDefaultCapabilities,
  summarizeProbeResult,
  type ProgressCallback,
  type ProbeProgress,
} from './inference';

// Cache
export {
  initializeCache,
  getCache,
  getCapabilities,
  getCapabilitySource,
  setLocalOverride,
  removeLocalOverride,
  clearLocalOverrides,
  updateCacheFromProbeResult,
  updateCacheFromProbeResults,
  removeCachedModel,
  clearCache,
  loadCacheFromFile,
  saveCacheToFile,
  getDefaultCachePath,
  getCacheStats,
  makeCacheKey,
  parseCacheKey,
  getStaticOverride,
  getProviderDefaults,
} from './cache';

// Provider adapters
export {
  getProviderEndpoint,
  getProviderHeaders,
  buildMessages,
  getApiKeyFromEnv,
  loadApiKeysFromFile,
  providerRequiresApiKey,
  providerRequiresEndpoint,
} from './provider-adapters';

// Fixtures
export {
  TINY_PNG_BASE64,
  TINY_PNG_MIME_TYPE,
  TINY_PDF_BASE64,
  TINY_PDF_MIME_TYPE,
  getTinyPngDataUrl,
  getTinyPdfDataUrl,
  PROBE_PROMPTS,
  getFixtureStats,
} from './fixtures';

// Individual probes (for advanced use)
export {
  probeText,
  probeImage,
  probePdf,
  probeSchema,
  probeStreaming,
} from './probes';

// Quick list file (shared between browser and CLI)
export {
  loadQuickListFromFile,
  saveQuickListToFile,
  getQuickListPath,
  quickListFileExists,
  type QuickListEntry,
  type QuickListFile,
} from './quick-list-file';
