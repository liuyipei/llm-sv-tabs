/**
 * Provider Adapters for Probing
 *
 * Handles provider-specific endpoint URLs, headers, and message formatting
 * for the capability probing system.
 */

import type { ProviderType } from '../types';

// ============================================================================
// Provider Endpoints
// ============================================================================

const PROVIDER_ENDPOINTS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  ollama: 'http://localhost:11434/v1/chat/completions',
  lmstudio: 'http://localhost:1234/v1/chat/completions',
  vllm: 'http://localhost:8000/v1/chat/completions',
  minimax: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
  'local-openai-compatible': 'http://localhost:8080/v1/chat/completions',
};

/**
 * Get the API endpoint for a provider
 */
export function getProviderEndpoint(
  provider: ProviderType,
  customEndpoint?: string
): string {
  if (customEndpoint) {
    // Ensure endpoint ends with the appropriate path
    const normalized = customEndpoint.replace(/\/$/, '');
    if (!normalized.includes('/chat/completions') && !normalized.includes('/messages')) {
      // Anthropic uses /messages, others use /chat/completions
      if (provider === 'anthropic') {
        return `${normalized}/v1/messages`;
      }
      return `${normalized}/v1/chat/completions`;
    }
    return normalized;
  }
  return PROVIDER_ENDPOINTS[provider];
}

// ============================================================================
// Provider Headers
// ============================================================================

/**
 * Get the required headers for a provider
 */
export function getProviderHeaders(
  provider: ProviderType,
  apiKey?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (provider) {
    case 'anthropic':
      if (apiKey) headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      break;

    case 'gemini':
      // Gemini uses API key in URL or header
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      break;

    case 'openrouter':
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://llm-sv-tabs.local';
      headers['X-Title'] = 'LLM-SV-Tabs Probe';
      break;

    case 'ollama':
    case 'lmstudio':
    case 'vllm':
    case 'local-openai-compatible':
      // Local providers typically don't need auth
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      break;

    default:
      // OpenAI, xAI, Fireworks, Minimax all use Bearer token
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      break;
  }

  return headers;
}

// ============================================================================
// Message Building
// ============================================================================

type ContentType = 'text' | 'image' | 'pdf';

interface MediaContent {
  base64?: string;
  dataUrl?: string;
  mimeType?: string;
}

/**
 * Build messages array for a specific provider
 */
export function buildMessages(
  provider: ProviderType,
  prompt: string,
  contentType: ContentType,
  media?: MediaContent,
  imagesFirst: boolean = false
): unknown[] {
  switch (provider) {
    case 'anthropic':
      return buildAnthropicMessages(prompt, contentType, media, imagesFirst);
    case 'gemini':
      return buildGeminiMessages(prompt, contentType, media, imagesFirst);
    default:
      return buildOpenAIMessages(prompt, contentType, media, imagesFirst);
  }
}

/**
 * Build OpenAI-compatible messages
 */
function buildOpenAIMessages(
  prompt: string,
  contentType: ContentType,
  media?: MediaContent,
  imagesFirst: boolean = false
): unknown[] {
  if (contentType === 'text' || !media) {
    return [{ role: 'user', content: prompt }];
  }

  const textPart = { type: 'text', text: prompt };

  let mediaPart: unknown;
  if (contentType === 'image') {
    const imageUrl = media.dataUrl ||
      `data:${media.mimeType || 'image/png'};base64,${media.base64}`;
    mediaPart = {
      type: 'image_url',
      image_url: { url: imageUrl },
    };
  } else if (contentType === 'pdf') {
    // OpenAI doesn't natively support PDF, but some compatible APIs might
    // Try sending as a file-like structure
    const pdfUrl = media.dataUrl ||
      `data:${media.mimeType || 'application/pdf'};base64,${media.base64}`;
    mediaPart = {
      type: 'file',
      file: {
        url: pdfUrl,
        type: media.mimeType || 'application/pdf',
      },
    };
  }

  const parts = imagesFirst
    ? [mediaPart, textPart]
    : [textPart, mediaPart];

  return [{ role: 'user', content: parts }];
}

/**
 * Build Anthropic-compatible messages
 */
function buildAnthropicMessages(
  prompt: string,
  contentType: ContentType,
  media?: MediaContent,
  imagesFirst: boolean = false
): unknown[] {
  if (contentType === 'text' || !media) {
    return [{ role: 'user', content: prompt }];
  }

  const textBlock = { type: 'text', text: prompt };

  let mediaBlock: unknown;
  if (contentType === 'image') {
    mediaBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: media.mimeType || 'image/png',
        data: media.base64 || (media.dataUrl?.split(',')[1] ?? ''),
      },
    };
  } else if (contentType === 'pdf') {
    // Anthropic supports native PDF via document blocks
    mediaBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: media.mimeType || 'application/pdf',
        data: media.base64 || (media.dataUrl?.split(',')[1] ?? ''),
      },
    };
  }

  const content = imagesFirst
    ? [mediaBlock, textBlock]
    : [textBlock, mediaBlock];

  return [{ role: 'user', content }];
}

/**
 * Build Gemini-compatible messages (OpenAI-compatible API format)
 */
function buildGeminiMessages(
  prompt: string,
  contentType: ContentType,
  media?: MediaContent,
  imagesFirst: boolean = false
): unknown[] {
  if (contentType === 'text' || !media) {
    return [{ role: 'user', content: prompt }];
  }

  const textPart = { type: 'text', text: prompt };

  let mediaPart: unknown;
  if (contentType === 'image') {
    // Gemini via OpenAI-compatible API uses image_url
    const imageUrl = media.dataUrl ||
      `data:${media.mimeType || 'image/png'};base64,${media.base64}`;
    mediaPart = {
      type: 'image_url',
      image_url: { url: imageUrl },
    };
  } else if (contentType === 'pdf') {
    // Gemini may support PDF via inline_data in native API,
    // but via OpenAI-compatible it's less clear
    const pdfUrl = media.dataUrl ||
      `data:${media.mimeType || 'application/pdf'};base64,${media.base64}`;
    mediaPart = {
      type: 'file',
      file: {
        url: pdfUrl,
        type: media.mimeType || 'application/pdf',
      },
    };
  }

  const parts = imagesFirst
    ? [mediaPart, textPart]
    : [textPart, mediaPart];

  return [{ role: 'user', content: parts }];
}

// ============================================================================
// API Key Resolution
// ============================================================================

/**
 * Environment variable names for API keys
 */
const API_KEY_ENV_VARS: Record<ProviderType, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  ollama: 'OLLAMA_API_KEY',
  lmstudio: 'LMSTUDIO_API_KEY',
  vllm: 'VLLM_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  'local-openai-compatible': 'LOCAL_OPENAI_API_KEY',
};

/**
 * Get API key from environment variables
 */
export function getApiKeyFromEnv(provider: ProviderType): string | undefined {
  const envVar = API_KEY_ENV_VARS[provider];
  return process.env[envVar];
}

/**
 * Load API keys from a JSON file (for CLI usage)
 */
export async function loadApiKeysFromFile(
  filePath: string
): Promise<Record<ProviderType, string>> {
  const fs = await import('fs').then(m => m.promises);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const keys = JSON.parse(content) as Record<string, string>;

    // Map to provider types
    const result: Partial<Record<ProviderType, string>> = {};
    for (const [key, value] of Object.entries(keys)) {
      if (isValidProviderType(key) && typeof value === 'string') {
        result[key as ProviderType] = value;
      }
    }

    return result as Record<ProviderType, string>;
  } catch {
    return {} as Record<ProviderType, string>;
  }
}

/**
 * Check if a string is a valid provider type
 */
function isValidProviderType(value: string): value is ProviderType {
  const validTypes: ProviderType[] = [
    'openai', 'anthropic', 'gemini', 'xai', 'openrouter',
    'fireworks', 'ollama', 'lmstudio', 'vllm', 'minimax',
    'local-openai-compatible',
  ];
  return validTypes.includes(value as ProviderType);
}

// ============================================================================
// Provider Requirements
// ============================================================================

/**
 * Check if a provider requires an API key
 */
export function providerRequiresApiKey(provider: ProviderType): boolean {
  const noKeyProviders: ProviderType[] = [
    'ollama', 'lmstudio', 'vllm', 'local-openai-compatible',
  ];
  return !noKeyProviders.includes(provider);
}

/**
 * Check if a provider requires a custom endpoint
 */
export function providerRequiresEndpoint(provider: ProviderType): boolean {
  const endpointProviders: ProviderType[] = [
    'ollama', 'lmstudio', 'vllm', 'local-openai-compatible',
  ];
  return endpointProviders.includes(provider);
}
