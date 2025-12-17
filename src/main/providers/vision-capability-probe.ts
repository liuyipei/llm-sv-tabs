/**
 * Vision capability probing and caching for LLM providers
 *
 * For closed-source/hosted models, we can't reliably infer vision support
 * from model names. This module provides runtime probing with a minimal
 * multimodal request and caches results per (provider, endpoint, model).
 */

import { buildOpenAIHeaders } from './openai-helpers.js';

export interface VisionProbeResult {
  supportsVision: boolean;
  reason?: string;
  probedAt?: number;
}

/**
 * Cache key format: provider::endpoint::model
 */
type CapsCacheKey = `${string}::${string}::${string}`;

/**
 * In-memory cache for vision capability probe results.
 * Persists for the lifetime of the Electron process.
 */
const visionCapabilityCache = new Map<CapsCacheKey, VisionProbeResult>();

/**
 * 1x1 transparent PNG - smallest valid image for probing
 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X9lXkAAAAASUVORK5CYII=';

const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

/**
 * Build cache key from provider, endpoint, and model
 */
function buildCacheKey(
  provider: string,
  endpoint: string,
  model: string
): CapsCacheKey {
  return `${provider}::${endpoint}::${model}`;
}

/**
 * Check if an error response indicates lack of vision support
 * (vs. transient errors like auth failures, rate limits, etc.)
 */
function isVisionNotSupportedError(errorText: string): boolean {
  const visionKeywords = /image_url|images?|multimodal|vision|content.?type|modality/i;
  const notSupportedKeywords = /not.?supported|unsupported|invalid|cannot.?process|not.?accept|not.?allow/i;

  return visionKeywords.test(errorText) && notSupportedKeywords.test(errorText);
}

/**
 * Probe a model's vision capability by sending a minimal multimodal request.
 *
 * This sends a tiny 1x1 PNG with a simple prompt and checks if the API:
 * - Accepts it → vision supported
 * - Rejects with "unsupported content type" → vision not supported
 * - Fails for other reasons → inconclusive (transient error)
 */
export async function probeVisionSupport(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  provider: string = 'unknown'
): Promise<VisionProbeResult> {
  const cacheKey = buildCacheKey(provider, endpoint, model);

  // Check cache first
  const cached = visionCapabilityCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Reply with exactly: OK' },
          { type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } },
        ],
      },
    ],
    max_tokens: 5,
  };

  try {
    const headers = buildOpenAIHeaders(apiKey, {}, true);

    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.ok) {
      // Successfully processed multimodal content
      const result: VisionProbeResult = {
        supportsVision: true,
        probedAt: Date.now(),
      };
      visionCapabilityCache.set(cacheKey, result);
      return result;
    }

    const errorText = await response.text();

    if (isVisionNotSupportedError(errorText)) {
      // Definitively not supported
      const result: VisionProbeResult = {
        supportsVision: false,
        reason: errorText.slice(0, 300),
        probedAt: Date.now(),
      };
      visionCapabilityCache.set(cacheKey, result);
      return result;
    }

    // Transient error (auth, rate limit, etc.) - don't cache permanently
    return {
      supportsVision: false,
      reason: `Probe failed (HTTP ${response.status}): ${errorText.slice(0, 200)}`,
    };
  } catch (error) {
    // Network/connection error - don't cache
    return {
      supportsVision: false,
      reason: `Probe error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get cached vision capability for a model (without probing)
 */
export function getCachedVisionCapability(
  provider: string,
  endpoint: string,
  model: string
): VisionProbeResult | undefined {
  const cacheKey = buildCacheKey(provider, endpoint, model);
  return visionCapabilityCache.get(cacheKey);
}

/**
 * Set vision capability in cache (for known capabilities from model metadata)
 */
export function setVisionCapability(
  provider: string,
  endpoint: string,
  model: string,
  supportsVision: boolean,
  reason?: string
): void {
  const cacheKey = buildCacheKey(provider, endpoint, model);
  visionCapabilityCache.set(cacheKey, {
    supportsVision,
    reason,
    probedAt: Date.now(),
  });
}

/**
 * Clear vision capability cache (useful for testing or config changes)
 */
export function clearVisionCapabilityCache(): void {
  visionCapabilityCache.clear();
}

/**
 * Check if messages contain any image content
 */
export function hasImageContent(
  messages: Array<{ role: string; content: unknown }>
): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          block !== null &&
          ('type' in block) &&
          (block.type === 'image' || block.type === 'image_url')
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Strip image content from messages, preserving text content only.
 * Useful as a fallback when vision is not supported.
 */
export function stripImageContent(
  messages: Array<{ role: string; content: unknown }>
): Array<{ role: string; content: string }> {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter(
          (block): block is { type: 'text'; text: string } =>
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            block.type === 'text' &&
            'text' in block
        )
        .map(block => block.text);

      return {
        role: msg.role,
        content: textParts.join('\n\n'),
      };
    }

    return { role: msg.role, content: '' };
  });
}
