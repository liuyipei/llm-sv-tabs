/**
 * Provider-Specific Capability Probes
 *
 * An adapter pattern for probing model capabilities across different providers.
 * Each provider may have different API formats and probe strategies.
 */

import type { ProviderType } from '../../types.js';
import {
  setModelCapabilities,
  type ModelCapabilities,
  type CapabilitySource,
  inferCapabilitiesFromName,
} from './model-capabilities.js';
import { buildOpenAIHeaders } from './openai-helpers.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a capability probe
 */
export interface ProbeResult {
  success: boolean;
  capabilities?: Partial<ModelCapabilities>;
  error?: string;
  source: CapabilitySource;
}

/**
 * Probe adapter interface - each provider implements this
 */
export interface CapabilityProbeAdapter {
  /**
   * Provider type this adapter handles
   */
  readonly providerType: ProviderType;

  /**
   * Probe a model's vision capability
   */
  probeVision(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult>;

  /**
   * Probe a model's function calling capability
   */
  probeFunctionCalling?(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult>;

  /**
   * Probe a model's JSON mode capability
   */
  probeJsonMode?(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult>;

  /**
   * Fetch capabilities from model metadata endpoint
   */
  fetchFromMetadata?(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult>;
}

// ============================================================================
// Minimal Probe Payloads
// ============================================================================

/**
 * 1x1 transparent PNG - smallest valid image for vision probing
 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X9lXkAAAAASUVORK5CYII=';

const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

/**
 * Check if an error response indicates lack of vision support
 */
function isVisionNotSupportedError(errorText: string): boolean {
  const visionKeywords = /image_url|images?|multimodal|vision|content.?type|modality/i;
  const notSupportedKeywords = /not.?supported|unsupported|invalid|cannot.?process|not.?accept|not.?allow/i;
  return visionKeywords.test(errorText) && notSupportedKeywords.test(errorText);
}

/**
 * Check if an error indicates function calling is not supported
 */
function isFunctionCallingNotSupportedError(errorText: string): boolean {
  const functionKeywords = /function|tool|tools|function_call/i;
  const notSupportedKeywords = /not.?supported|unsupported|invalid|not.?available/i;
  return functionKeywords.test(errorText) && notSupportedKeywords.test(errorText);
}

// ============================================================================
// OpenAI-Compatible Probe Adapter
// ============================================================================

/**
 * Probe adapter for OpenAI-compatible APIs (OpenAI, vLLM, OpenRouter, etc.)
 */
export class OpenAICompatibleProbeAdapter implements CapabilityProbeAdapter {
  constructor(public readonly providerType: ProviderType) {}

  async probeVision(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult> {
    const body = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } },
            { type: 'text', text: 'Reply with exactly: OK' },
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
        return {
          success: true,
          capabilities: {
            inputModalities: ['text', 'image'],
          },
          source: 'runtime_probe',
        };
      }

      const errorText = await response.text();
      if (isVisionNotSupportedError(errorText)) {
        return {
          success: true,
          capabilities: {
            inputModalities: ['text'],
          },
          source: 'runtime_probe',
        };
      }

      // Transient error
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        source: 'runtime_probe',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'runtime_probe',
      };
    }
  }

  async probeFunctionCalling(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult> {
    const body = {
      model: modelId,
      messages: [
        { role: 'user', content: 'What is the weather?' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
            },
          },
        },
      ],
      max_tokens: 10,
    };

    try {
      const headers = buildOpenAIHeaders(apiKey, {}, true);
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return {
          success: true,
          capabilities: {
            supportsFunctionCalling: true,
          },
          source: 'runtime_probe',
        };
      }

      const errorText = await response.text();
      if (isFunctionCallingNotSupportedError(errorText)) {
        return {
          success: true,
          capabilities: {
            supportsFunctionCalling: false,
          },
          source: 'runtime_probe',
        };
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        source: 'runtime_probe',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'runtime_probe',
      };
    }
  }

  async fetchFromMetadata(
    endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult> {
    try {
      const headers = buildOpenAIHeaders(apiKey);
      const response = await fetch(`${endpoint}/v1/models/${encodeURIComponent(modelId)}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        // Try the list endpoint instead
        const listResponse = await fetch(`${endpoint}/v1/models`, {
          method: 'GET',
          headers,
        });

        if (!listResponse.ok) {
          return {
            success: false,
            error: `Failed to fetch model info`,
            source: 'api_metadata',
          };
        }

        const data = await listResponse.json() as { data?: Array<{ id: string; capabilities?: { vision?: boolean } }> };
        const model = data.data?.find(m => m.id === modelId);

        if (model?.capabilities) {
          return {
            success: true,
            capabilities: {
              inputModalities: model.capabilities.vision ? ['text', 'image'] : ['text'],
            },
            source: 'api_metadata',
          };
        }

        return {
          success: false,
          error: 'No capabilities in metadata',
          source: 'api_metadata',
        };
      }

      const model = await response.json() as { capabilities?: { vision?: boolean; function_calling?: boolean } };
      if (model.capabilities) {
        return {
          success: true,
          capabilities: {
            inputModalities: model.capabilities.vision ? ['text', 'image'] : ['text'],
            supportsFunctionCalling: model.capabilities.function_calling,
          },
          source: 'api_metadata',
        };
      }

      return {
        success: false,
        error: 'No capabilities in model response',
        source: 'api_metadata',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'api_metadata',
      };
    }
  }
}

// ============================================================================
// Anthropic Probe Adapter
// ============================================================================

/**
 * Probe adapter for Anthropic API
 */
export class AnthropicProbeAdapter implements CapabilityProbeAdapter {
  readonly providerType: ProviderType = 'anthropic';
  private static readonly API_BASE = 'https://api.anthropic.com/v1';
  private static readonly API_VERSION = '2023-06-01';

  async probeVision(
    _endpoint: string,
    apiKey: string | undefined,
    modelId: string
  ): Promise<ProbeResult> {
    if (!apiKey) {
      return {
        success: false,
        error: 'API key required for Anthropic probing',
        source: 'runtime_probe',
      };
    }

    const body = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: TINY_PNG_BASE64,
              },
            },
            { type: 'text', text: 'Reply with exactly: OK' },
          ],
        },
      ],
      max_tokens: 5,
    };

    try {
      const response = await fetch(`${AnthropicProbeAdapter.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': AnthropicProbeAdapter.API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return {
          success: true,
          capabilities: {
            inputModalities: ['text', 'image'],
          },
          source: 'runtime_probe',
        };
      }

      const errorText = await response.text();
      if (isVisionNotSupportedError(errorText)) {
        return {
          success: true,
          capabilities: {
            inputModalities: ['text'],
          },
          source: 'runtime_probe',
        };
      }

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        source: 'runtime_probe',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'runtime_probe',
      };
    }
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

const probeAdapters = new Map<ProviderType, CapabilityProbeAdapter>();

// Register default adapters
probeAdapters.set('openai', new OpenAICompatibleProbeAdapter('openai'));
probeAdapters.set('vllm', new OpenAICompatibleProbeAdapter('vllm'));
probeAdapters.set('ollama', new OpenAICompatibleProbeAdapter('ollama'));
probeAdapters.set('openrouter', new OpenAICompatibleProbeAdapter('openrouter'));
probeAdapters.set('fireworks', new OpenAICompatibleProbeAdapter('fireworks'));
probeAdapters.set('lmstudio', new OpenAICompatibleProbeAdapter('lmstudio'));
probeAdapters.set('local-openai-compatible', new OpenAICompatibleProbeAdapter('local-openai-compatible'));
probeAdapters.set('anthropic', new AnthropicProbeAdapter());

/**
 * Get the probe adapter for a provider
 */
export function getProbeAdapter(provider: ProviderType): CapabilityProbeAdapter | undefined {
  return probeAdapters.get(provider);
}

/**
 * Register a custom probe adapter
 */
export function registerProbeAdapter(adapter: CapabilityProbeAdapter): void {
  probeAdapters.set(adapter.providerType, adapter);
}

// ============================================================================
// High-Level Probe Functions
// ============================================================================

/**
 * Probe and register a model's capabilities.
 * Uses the appropriate adapter for the provider.
 */
export async function probeAndRegisterCapabilities(
  provider: ProviderType,
  endpoint: string,
  apiKey: string | undefined,
  modelId: string
): Promise<ModelCapabilities> {
  const adapter = getProbeAdapter(provider);

  // Start with name-inferred capabilities
  let caps = inferCapabilitiesFromName(modelId, provider);

  if (!adapter) {
    // No adapter, use inferred capabilities
    setModelCapabilities(provider, endpoint, modelId, caps, 'name_heuristic');
    return caps;
  }

  // Try to get capabilities from metadata first
  if (adapter.fetchFromMetadata) {
    const metadataResult = await adapter.fetchFromMetadata(endpoint, apiKey, modelId);
    if (metadataResult.success && metadataResult.capabilities) {
      caps = { ...caps, ...metadataResult.capabilities, source: 'api_metadata' };
      setModelCapabilities(provider, endpoint, modelId, caps, 'api_metadata');
      return caps;
    }
  }

  // Fall back to runtime probing
  const visionResult = await adapter.probeVision(endpoint, apiKey, modelId);
  if (visionResult.success && visionResult.capabilities) {
    caps = { ...caps, ...visionResult.capabilities, source: 'runtime_probe' };
  }

  // Probe function calling if available
  if (adapter.probeFunctionCalling) {
    const fcResult = await adapter.probeFunctionCalling(endpoint, apiKey, modelId);
    if (fcResult.success && fcResult.capabilities) {
      caps = { ...caps, ...fcResult.capabilities };
    }
  }

  // Register discovered capabilities
  setModelCapabilities(provider, endpoint, modelId, caps, caps.source);
  return caps;
}

/**
 * Quick vision probe - just checks if vision is supported
 */
export async function quickVisionProbe(
  provider: ProviderType,
  endpoint: string,
  apiKey: string | undefined,
  modelId: string
): Promise<boolean> {
  const adapter = getProbeAdapter(provider);
  if (!adapter) {
    // Infer from name
    const caps = inferCapabilitiesFromName(modelId, provider);
    return caps.inputModalities.includes('image');
  }

  const result = await adapter.probeVision(endpoint, apiKey, modelId);
  if (result.success && result.capabilities?.inputModalities) {
    return result.capabilities.inputModalities.includes('image');
  }

  // Fall back to name inference
  const caps = inferCapabilitiesFromName(modelId, provider);
  return caps.inputModalities.includes('image');
}
