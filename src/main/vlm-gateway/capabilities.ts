import { readFileSync } from 'fs';
import { join } from 'path';
import type { ProviderType } from '../../types.js';
import type { ModelSelector } from './models.js';
import type { ModelCapabilities } from './types.internal.js';
import { getPortkeyModelMetadata } from './portkey-client.js';

const LOCAL_CAPABILITIES_PATH = join(process.cwd(), 'src', 'main', 'vlm-gateway', 'model-capabilities.local.json');

const STATIC_OVERRIDES: Record<string, ModelCapabilities> = {
  'gpt-4o': { supportsText: true, supportsVision: true, supportsAudioInput: false, supportsAudioOutput: false, supportsPdfNative: false, supportsImageGeneration: false },
  'gpt-4o-mini': { supportsText: true, supportsVision: true, supportsAudioInput: false, supportsAudioOutput: false, supportsPdfNative: false, supportsImageGeneration: false },
  'claude-3-5-sonnet-20241022': { supportsText: true, supportsVision: true, supportsAudioInput: false, supportsAudioOutput: false, supportsPdfNative: false, supportsImageGeneration: false },
  'claude-3-7-sonnet-20250219': { supportsText: true, supportsVision: true, supportsAudioInput: false, supportsAudioOutput: false, supportsPdfNative: false, supportsImageGeneration: false },
  'gemini-2.0-flash-exp': { supportsText: true, supportsVision: true, supportsAudioInput: false, supportsAudioOutput: false, supportsPdfNative: false, supportsImageGeneration: false },
};

function loadLocalOverrides(): Record<string, ModelCapabilities> {
  try {
    const content = readFileSync(LOCAL_CAPABILITIES_PATH, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, ModelCapabilities>;
    return parsed;
  } catch {
    return {};
  }
}

function providerDefaults(provider?: ProviderType): ModelCapabilities {
  switch (provider) {
    case 'ollama':
    case 'lmstudio':
    case 'local-openai-compatible':
      return {
        supportsText: true,
        supportsVision: false,
        supportsAudioInput: false,
        supportsAudioOutput: false,
        supportsPdfNative: false,
        supportsImageGeneration: false,
      };
    default:
      return {
        supportsText: true,
        supportsVision: false,
        supportsAudioInput: false,
        supportsAudioOutput: false,
        supportsPdfNative: false,
        supportsImageGeneration: false,
      };
  }
}

function mergeCapabilities(
  base: ModelCapabilities,
  updates?: Partial<ModelCapabilities>
): ModelCapabilities {
  return { ...base, ...updates };
}

export async function getModelCapabilities(
  selector: ModelSelector,
  apiKey?: string
): Promise<ModelCapabilities> {
  const local = loadLocalOverrides();
  if (local[selector.model]) {
    return mergeCapabilities(providerDefaults(selector.provider), local[selector.model]);
  }

  if (STATIC_OVERRIDES[selector.model]) {
    return mergeCapabilities(providerDefaults(selector.provider), STATIC_OVERRIDES[selector.model]);
  }

  if (selector.providerKind === 'portkey') {
    const metadata = await getPortkeyModelMetadata(selector.model, apiKey);
    if (metadata) {
      const capabilities: ModelCapabilities = {
        supportsText: metadata.modalities?.includes('text') ?? true,
        supportsVision: metadata.modalities?.includes('image') ?? false,
        supportsAudioInput: metadata.modalities?.includes('audio') ?? false,
        supportsAudioOutput: metadata.modalities?.includes('audio_output') ?? false,
        supportsPdfNative: metadata.modalities?.includes('pdf') ?? false,
        supportsImageGeneration: metadata.modalities?.includes('image_generation') ?? false,
        maxInputTokens: metadata.maxInputTokens,
        maxOutputTokens: metadata.maxOutputTokens,
        requiresImagesFirst: metadata.requiresImagesFirst,
        requiresBase64Images: metadata.requiresBase64Images,
      };

      return mergeCapabilities(providerDefaults(selector.provider), capabilities);
    }
  }

  return providerDefaults(selector.provider);
}
