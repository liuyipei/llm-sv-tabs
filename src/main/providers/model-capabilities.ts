/**
 * Model Capabilities Registry
 *
 * A typed, extensible registry for model capabilities including:
 * - Supported modalities (text, image, video, audio, etc.)
 * - Content ordering requirements (image-first, text-first)
 * - Context windows and token limits
 * - Provider-specific behaviors
 *
 * Designed for forward compatibility with new modalities and model types.
 */

import type { ProviderType } from '../../types.js';

// ============================================================================
// Modality Types
// ============================================================================

/**
 * Supported input modalities for LLM models.
 * Extensible for future modalities.
 */
export type InputModality =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | '3d'
  | 'code'
  | 'structured_data';

/**
 * Supported output modalities for LLM models.
 */
export type OutputModality =
  | 'text'
  | 'image'
  | 'audio'
  | 'code'
  | 'structured_data'
  | 'tool_calls';

/**
 * Content ordering preference for multimodal inputs.
 * Critical for models like Llama 4, Qwen3-VL that require images before text.
 */
export type ContentOrdering = 'images_first' | 'text_first' | 'any';

// ============================================================================
// Capability Definitions
// ============================================================================

/**
 * Detailed capabilities for a specific model.
 */
export interface ModelCapabilities {
  /** Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022') */
  modelId: string;

  /** Provider this model belongs to */
  provider: ProviderType;

  /** Human-readable display name */
  displayName?: string;

  /** Supported input modalities */
  inputModalities: InputModality[];

  /** Supported output modalities */
  outputModalities: OutputModality[];

  /** Required content ordering for multimodal inputs */
  contentOrdering: ContentOrdering;

  /** Maximum context window in tokens */
  contextWindow?: number;

  /** Maximum output tokens */
  maxOutputTokens?: number;

  /** Whether streaming is supported */
  supportsStreaming: boolean;

  /** Whether function/tool calling is supported */
  supportsFunctionCalling?: boolean;

  /** Whether JSON mode is supported */
  supportsJsonMode?: boolean;

  /** Whether system prompts are supported */
  supportsSystemPrompt: boolean;

  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>;

  /** Source of capability info (for debugging/transparency) */
  source: CapabilitySource;

  /** When this capability info was last updated */
  updatedAt?: number;
}

/**
 * Where capability information came from.
 * Higher priority sources override lower priority.
 */
export type CapabilitySource =
  | 'user_override'      // User explicitly configured (highest priority)
  | 'runtime_probe'      // Discovered via API probe
  | 'api_metadata'       // From /v1/models capabilities field
  | 'static_registry'    // Built-in known models
  | 'name_heuristic';    // Inferred from model name (lowest priority)

/**
 * Priority order for capability sources (lower index = higher priority)
 */
const SOURCE_PRIORITY: CapabilitySource[] = [
  'user_override',
  'runtime_probe',
  'api_metadata',
  'static_registry',
  'name_heuristic',
];

// ============================================================================
// Registry Implementation
// ============================================================================

/**
 * Cache key for model capabilities: provider::endpoint::modelId
 */
type CapabilityKey = `${string}::${string}::${string}`;

function buildKey(provider: string, endpoint: string, modelId: string): CapabilityKey {
  return `${provider}::${endpoint}::${modelId}`;
}

/**
 * In-memory capability cache with source tracking
 */
const capabilityCache = new Map<CapabilityKey, ModelCapabilities>();

/**
 * User overrides stored separately for persistence
 */
const userOverrides = new Map<CapabilityKey, Partial<ModelCapabilities>>();

// ============================================================================
// Static Model Registry
// ============================================================================

/**
 * Default capabilities for creating new entries
 */
const DEFAULT_CAPABILITIES: Omit<ModelCapabilities, 'modelId' | 'provider' | 'source'> = {
  inputModalities: ['text'],
  outputModalities: ['text'],
  contentOrdering: 'any',
  supportsStreaming: true,
  supportsSystemPrompt: true,
};

/**
 * Built-in capabilities for well-known models.
 * These serve as fallbacks when API metadata is unavailable.
 */
const STATIC_REGISTRY: ModelCapabilities[] = [
  // OpenAI GPT-5 family (Dec 2025)
  {
    modelId: 'gpt-5.2-high',
    provider: 'openai',
    displayName: 'GPT-5.2 High',
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text', 'image', 'audio'],
    contentOrdering: 'any',
    contextWindow: 256000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'gpt-5-omni',
    provider: 'openai',
    displayName: 'GPT-5 Omni',
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text', 'image', 'audio'],
    contentOrdering: 'any',
    contextWindow: 256000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // OpenAI GPT-4.1 family (April 2025)
  {
    modelId: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'gpt-4.1-mini',
    provider: 'openai',
    displayName: 'GPT-4.1 Mini',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // OpenAI o-series reasoning models
  {
    modelId: 'o3-vision',
    provider: 'openai',
    displayName: 'o3 Vision',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'o4-mini',
    provider: 'openai',
    displayName: 'o4-mini',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // OpenAI GPT-4o family
  {
    modelId: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    inputModalities: ['text', 'image', 'audio'],
    outputModalities: ['text', 'audio'],
    contentOrdering: 'any',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsJsonMode: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // OpenAI Legacy (text-only)
  {
    modelId: 'gpt-4',
    provider: 'openai',
    displayName: 'GPT-4',
    inputModalities: ['text'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 8192,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'gpt-3.5-turbo',
    provider: 'openai',
    displayName: 'GPT-3.5 Turbo',
    inputModalities: ['text'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 16385,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // Anthropic Claude 4.5 family (Dec 2025)
  {
    modelId: 'claude-4.5-opus',
    provider: 'anthropic',
    displayName: 'Claude 4.5 Opus',
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'claude-4.5-sonnet',
    provider: 'anthropic',
    displayName: 'Claude 4.5 Sonnet',
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // Anthropic Claude 4 family (May 2025)
  {
    modelId: 'claude-opus-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Opus 4',
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4',
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // Anthropic Claude 3.5 family
  {
    modelId: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    inputModalities: ['text', 'image', 'pdf'],
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    inputModalities: ['text', 'image'],  // Vision added Feb 2025
    outputModalities: ['text'],
    contentOrdering: 'any',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // vLLM Qwen family (image-first ordering required)
  {
    modelId: 'Qwen/Qwen3-VL-72B',
    provider: 'vllm',
    displayName: 'Qwen3-VL 72B',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    contentOrdering: 'images_first',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'Qwen/Qwen2-VL-72B-Instruct',
    provider: 'vllm',
    displayName: 'Qwen2-VL 72B',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    contentOrdering: 'images_first',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },

  // Meta Llama 4 family (image-first ordering required)
  {
    modelId: 'meta-llama/Llama-4-Maverick-17B-128E',
    provider: 'vllm',
    displayName: 'Llama 4 Maverick 17B',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'images_first',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
  {
    modelId: 'meta-llama/Llama-4-Scout-17B-16E',
    provider: 'vllm',
    displayName: 'Llama 4 Scout 17B',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    contentOrdering: 'images_first',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsSystemPrompt: true,
    source: 'static_registry',
  },
];

// Initialize cache with static registry
function initializeStaticRegistry(): void {
  for (const caps of STATIC_REGISTRY) {
    // Use empty endpoint for static entries (not endpoint-specific)
    const key = buildKey(caps.provider, '', caps.modelId);
    capabilityCache.set(key, caps);
  }
}

// Run initialization
initializeStaticRegistry();

// ============================================================================
// Public API
// ============================================================================

/**
 * Get capabilities for a model.
 * Checks in order: user overrides → cache → static registry → defaults
 */
export function getModelCapabilities(
  provider: ProviderType,
  endpoint: string,
  modelId: string
): ModelCapabilities | undefined {
  const key = buildKey(provider, endpoint, modelId);
  const staticKey = buildKey(provider, '', modelId);

  // Check endpoint-specific cache first
  let caps = capabilityCache.get(key);

  // Fall back to static registry (empty endpoint)
  if (!caps) {
    caps = capabilityCache.get(staticKey);
  }

  if (!caps) {
    return undefined;
  }

  // Apply user overrides if any
  const override = userOverrides.get(key) || userOverrides.get(staticKey);
  if (override) {
    return {
      ...caps,
      ...override,
      source: 'user_override',
      updatedAt: Date.now(),
    };
  }

  return caps;
}

/**
 * Set capabilities for a model.
 * Source determines priority - higher priority sources override lower.
 */
export function setModelCapabilities(
  provider: ProviderType,
  endpoint: string,
  modelId: string,
  capabilities: Partial<ModelCapabilities>,
  source: CapabilitySource
): void {
  const key = buildKey(provider, endpoint, modelId);
  const existing = capabilityCache.get(key);

  // Check if existing entry has higher priority
  if (existing) {
    const existingPriority = SOURCE_PRIORITY.indexOf(existing.source);
    const newPriority = SOURCE_PRIORITY.indexOf(source);
    if (existingPriority < newPriority) {
      // Existing has higher priority, don't override
      return;
    }
  }

  const fullCaps: ModelCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...existing,
    ...capabilities,
    modelId,
    provider,
    source,
    updatedAt: Date.now(),
  };

  capabilityCache.set(key, fullCaps);
}

/**
 * Set a user override for model capabilities.
 * User overrides have the highest priority.
 */
export function setUserOverride(
  provider: ProviderType,
  endpoint: string,
  modelId: string,
  overrides: Partial<ModelCapabilities>
): void {
  const key = buildKey(provider, endpoint, modelId);
  userOverrides.set(key, {
    ...userOverrides.get(key),
    ...overrides,
  });
}

/**
 * Clear user override for a model
 */
export function clearUserOverride(
  provider: ProviderType,
  endpoint: string,
  modelId: string
): void {
  const key = buildKey(provider, endpoint, modelId);
  userOverrides.delete(key);
}

/**
 * Get all user overrides (for persistence)
 */
export function getUserOverrides(): Map<CapabilityKey, Partial<ModelCapabilities>> {
  return new Map(userOverrides);
}

/**
 * Restore user overrides (from persistence)
 */
export function restoreUserOverrides(
  overrides: Iterable<[CapabilityKey, Partial<ModelCapabilities>]>
): void {
  userOverrides.clear();
  for (const [key, value] of overrides) {
    userOverrides.set(key, value);
  }
}

// ============================================================================
// Capability Helpers
// ============================================================================

/**
 * Check if a model supports a specific input modality
 */
export function supportsInputModality(
  caps: ModelCapabilities | undefined,
  modality: InputModality
): boolean {
  if (!caps) return modality === 'text'; // Default: text only
  return caps.inputModalities.includes(modality);
}

/**
 * Check if a model supports vision (image input)
 */
export function supportsVision(caps: ModelCapabilities | undefined): boolean {
  return supportsInputModality(caps, 'image');
}

/**
 * Check if a model requires images before text
 */
export function requiresImagesFirst(caps: ModelCapabilities | undefined): boolean {
  return caps?.contentOrdering === 'images_first';
}

/**
 * Get the recommended content ordering for a model
 */
export function getContentOrdering(caps: ModelCapabilities | undefined): ContentOrdering {
  return caps?.contentOrdering ?? 'any';
}

// ============================================================================
// Name-Based Heuristics
// ============================================================================

/**
 * Patterns for detecting vision models by name
 */
const VISION_MODEL_PATTERNS = [
  /qwen.*vl/i,
  /qwen.*vision/i,
  /llava/i,
  /llama.*4.*(maverick|scout)/i,
  /cogvlm/i,
  /internvl/i,
  /phi.*vision/i,
  /minicpm.*v/i,
  /deepseek.*vl/i,
  /deepseek.*vision/i,
  /yi.*vl/i,
  /glm.*v/i,
  /nemotron.*vl/i,
  /-vl\b/i,
  /-omni\b/i,
  /vision/i,
  /gpt-4o/i,
  /gpt-4-turbo/i,
  /gpt-5/i,
  /claude-3/i,
  /claude-4/i,
  /gemini/i,
];

/**
 * Patterns for models requiring images-first ordering
 */
const IMAGES_FIRST_PATTERNS = [
  /qwen.*vl/i,
  /llama.*4/i,
];

/**
 * Infer capabilities from model name when no other info is available
 */
export function inferCapabilitiesFromName(
  modelId: string,
  provider: ProviderType
): ModelCapabilities {
  const supportsVision = VISION_MODEL_PATTERNS.some(p => p.test(modelId));
  const imagesFirst = IMAGES_FIRST_PATTERNS.some(p => p.test(modelId));

  return {
    modelId,
    provider,
    inputModalities: supportsVision ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    contentOrdering: imagesFirst ? 'images_first' : 'any',
    supportsStreaming: true,
    supportsSystemPrompt: true,
    source: 'name_heuristic',
    updatedAt: Date.now(),
  };
}

/**
 * Register capabilities inferred from model name (lowest priority)
 */
export function registerFromNameHeuristic(
  provider: ProviderType,
  endpoint: string,
  modelId: string
): ModelCapabilities {
  const caps = inferCapabilitiesFromName(modelId, provider);
  setModelCapabilities(provider, endpoint, modelId, caps, 'name_heuristic');
  return caps;
}

// ============================================================================
// Exports for testing
// ============================================================================

export const _testing = {
  capabilityCache,
  userOverrides,
  buildKey,
  initializeStaticRegistry,
  STATIC_REGISTRY,
};
