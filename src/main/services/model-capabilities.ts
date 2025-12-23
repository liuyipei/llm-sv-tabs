import type { ProviderType } from '../../types';
import type {
  CachedModelCapabilities,
  ModelCapabilitiesCache,
  ModelProbeResult,
  ProbedCapabilities,
} from '../../probe/types';
import {
  DEFAULT_PROBE_CONFIG,
  getCapabilities as resolveCachedCapabilities,
  getCache,
  initializeCache,
  loadCacheFromFile,
  makeCacheKey,
  saveCacheToFile,
  updateCacheFromProbeResult,
} from '../../probe/index.js';
import { probeModel } from '../../probe/index.js';
import {
  PROBE_TABLE_HEADERS,
  formatProbeTableRow,
  renderTable,
} from '../../probe/output-format.js';

const CAPABILITY_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let cacheLoaded = false;
const probeInFlight = new Map<string, Promise<ModelProbeResult>>();
let probeLogHeaderPrinted = false;

async function ensureCacheInitialized(): Promise<void> {
  if (cacheLoaded) return;

  const cache = await loadCacheFromFile();
  if (!cache) {
    initializeCache();
  }
  cacheLoaded = true;
}

export async function loadCapabilityCacheFromDisk(): Promise<ModelCapabilitiesCache> {
  const cache = await loadCacheFromFile();
  if (!cache) {
    initializeCache();
  }
  cacheLoaded = true;
  return getCache();
}

export function getCachedCapability(
  provider: ProviderType,
  model: string
): CachedModelCapabilities | undefined {
  const key = makeCacheKey(provider, model);
  const cache = getCache();
  return cache.models[key];
}

export function isCapabilityStale(entry?: CachedModelCapabilities): boolean {
  if (!entry) return true;
  return Date.now() - entry.lastProbedAt > CAPABILITY_STALE_MS;
}

async function runProbe(
  provider: ProviderType,
  model: string,
  apiKey?: string,
  endpoint?: string
): Promise<ModelProbeResult> {
  await ensureCacheInitialized();
  const key = makeCacheKey(provider, model);

  if (probeInFlight.has(key)) {
    return probeInFlight.get(key)!;
  }

  const probePromise = (async () => {
    const result = await probeModel(
      provider,
      model,
      apiKey,
      endpoint,
      DEFAULT_PROBE_CONFIG
    );

    logProbeSummary(result);
    updateCacheFromProbeResult(result);
    await saveCacheToFile();
    return result;
  })();

  probeInFlight.set(key, probePromise);

  try {
    return await probePromise;
  } finally {
    probeInFlight.delete(key);
  }
}

export async function probeAndCacheModel(
  provider: ProviderType,
  model: string,
  apiKey?: string,
  endpoint?: string
): Promise<ModelProbeResult> {
  return runProbe(provider, model, apiKey, endpoint);
}

export async function resolveModelCapabilities(
  provider: ProviderType,
  model: string,
  options: { apiKey?: string; endpoint?: string; forceProbe?: boolean } = {}
): Promise<ProbedCapabilities> {
  await ensureCacheInitialized();
  const key = makeCacheKey(provider, model);
  const cached = getCache().models[key];
  const shouldProbe = options.forceProbe || isCapabilityStale(cached);

  if (shouldProbe) {
    try {
      await runProbe(provider, model, options.apiKey, options.endpoint);
    } catch (error) {
      console.warn(`Probe failed for ${provider}:${model}`, error);
    }
  }

  return resolveCachedCapabilities(provider, model);
}

function logProbeSummary(result: ModelProbeResult): void {
  if (!probeLogHeaderPrinted) {
    const headerLines = renderTable(PROBE_TABLE_HEADERS, [formatProbeTableRow(result, 50)]).slice(0, 2);
    console.log();
    headerLines.forEach(line => console.log(line));
    probeLogHeaderPrinted = true;
  }

  const row = formatProbeTableRow(result, 50);
  const dataLine = renderTable(PROBE_TABLE_HEADERS, [row])[2];
  console.log(dataLine);
}
