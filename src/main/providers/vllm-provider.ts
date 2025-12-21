/**
 * vLLM provider implementation with Qwen3-VL vision support
 *
 * vLLM exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * For vision-language models like Qwen3-VL, messages can include
 * multimodal content with both text and image_url parts.
 *
 * Vision capability is determined by:
 * 1. Name-based heuristics (qwen-vl, llava, etc.)
 * 2. Runtime probing when uncertain (tiny image request)
 * 3. Caching probe results per (endpoint, model)
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import {
  buildOpenAIChatBody,
  buildOpenAIHeaders,
  parseOpenAIStream,
} from './openai-helpers.js';
import {
  probeVisionSupport,
  getCachedVisionCapability,
  setVisionCapability,
  hasImageContent,
  stripImageContent,
} from './vision-capability-probe.js';

/**
 * Patterns used to detect vision-language models by name.
 * Models matching these patterns are "likely" to support vision.
 */
const VISION_MODEL_PATTERNS = [
  /qwen.*vl/i,        // Qwen-VL, Qwen2-VL, Qwen3-VL
  /qwen.*vision/i,    // Qwen-Vision variants
  /llava/i,           // LLaVA models
  /llama.*4.*(maverick|scout)/i, // Llama 4 multimodal variants
  /cogvlm/i,          // CogVLM
  /internvl/i,        // InternVL
  /phi.*vision/i,     // Phi-Vision
  /minicpm.*v/i,      // MiniCPM-V
  /deepseek.*vl/i,    // DeepSeek-VL
  /deepseek.*vision/i, // DeepSeek vision variants
  /yi.*vl/i,          // Yi-VL
  /glm.*v/i,          // GLM-4V
  /nemotron.*vl/i,    // NVIDIA Nemotron VL
  /-vl\b/i,           // Generic -VL suffix
  /-omni\b/i,         // Omni models (multimodal)
  /vision/i,          // Generic vision keyword
];

/**
 * Model metadata from /v1/models endpoint (2025 extended format)
 */
interface ModelInfo {
  id: string;
  capabilities?: {
    vision?: boolean;
    function_calling?: boolean;
  };
  // Some providers use config instead
  config?: {
    vision?: boolean;
  };
}

/**
 * Check if a model name indicates likely vision capability
 */
function isLikelyVisionModel(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
}

export class VLLMProvider extends BaseProvider {
  constructor(endpoint?: string, apiKey?: string) {
    super('vllm', apiKey, endpoint);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: true, // vLLM can support vision when running VLMs
      requiresApiKey: false,
      requiresEndpoint: true,
      supportsSystemPrompt: true,
    };
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.endpoint) {
      return [];
    }

    try {
      const headers = buildOpenAIHeaders(this.apiKey);

      const response = await this.makeRequest(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers,
      });

      const data = (await response.json()) as { data?: ModelInfo[] };

      return (data.data || []).map(model => {
        // Check for capabilities in the 2025 extended format
        // Priority: explicit capabilities > config > name heuristics
        let supportsVision: boolean;

        if (model.capabilities?.vision !== undefined) {
          // Prefer explicit capabilities field (2025 standard)
          supportsVision = model.capabilities.vision;
        } else if (model.config?.vision !== undefined) {
          // Fallback to config field (some providers use this)
          supportsVision = model.config.vision;
        } else {
          // Fallback to name-based heuristics
          supportsVision = isLikelyVisionModel(model.id);
        }

        // Cache the discovered capability
        if (this.endpoint) {
          setVisionCapability('vllm', this.endpoint, model.id, supportsVision, 'model discovery');
        }

        return {
          id: model.id,
          name: model.id,
          provider: 'vllm' as const,
          supportsVision,
        };
      });
    } catch (error) {
      console.error('Failed to fetch vLLM models:', error);
      return [];
    }
  }

  /**
   * Check if vision is supported for the given model.
   * Uses cached result if available, otherwise probes the endpoint.
   */
  private async checkVisionSupport(
    endpoint: string,
    apiKey: string | undefined,
    model: string
  ): Promise<boolean> {
    // Check cache first
    const cached = getCachedVisionCapability('vllm', endpoint, model);
    if (cached !== undefined) {
      return cached.supportsVision;
    }

    // If model name suggests vision support, trust that heuristic
    // and set it in cache (can be overridden by actual failure later)
    if (isLikelyVisionModel(model)) {
      setVisionCapability('vllm', endpoint, model, true, 'name heuristic');
      return true;
    }

    // For unknown models, probe
    const probeResult = await probeVisionSupport(endpoint, apiKey, model, 'vllm');
    return probeResult.supportsVision;
  }

  /**
   * Prepare messages for sending, handling vision support detection.
   * Returns processed messages and whether images were stripped.
   */
  private async prepareMessages(
    messages: Array<{ role: string; content: MessageContent }>,
    endpoint: string,
    apiKey: string | undefined,
    model: string
  ): Promise<{ messages: Array<{ role: string; content: MessageContent }>; imagesStripped: boolean }> {
    // If no images in content, just return as-is
    if (!hasImageContent(messages as Array<{ role: string; content: unknown }>)) {
      return { messages, imagesStripped: false };
    }

    // Check if model supports vision
    const supportsVision = await this.checkVisionSupport(endpoint, apiKey, model);

    if (supportsVision) {
      return { messages, imagesStripped: false };
    }

    // Vision not supported - strip images and proceed with text only
    console.warn(
      `[vLLM] Model "${model}" does not appear to support vision. ` +
      'Images will be stripped from the request.'
    );
    const textOnlyMessages = stripImageContent(
      messages as Array<{ role: string; content: unknown }>
    );
    return { messages: textOnlyMessages, imagesStripped: true };
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.endpoint && !options?.endpoint) {
      return {
        response: '',
        error: 'Endpoint is required for vLLM provider',
      };
    }

    const endpoint = options?.endpoint || this.endpoint!;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      // Prepare messages (may strip images if vision not supported)
      const { messages: preparedMessages, imagesStripped } = await this.prepareMessages(
        messages,
        endpoint,
        apiKey,
        model
      );

      const headers = buildOpenAIHeaders(apiKey);

      const response = await this.makeRequest(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(preparedMessages, model, maxTokens, 'max_tokens')
        ),
      });

      const data = (await response.json()) as any;
      const responseTime = Date.now() - startTime;

      let responseText = data.choices[0]?.message?.content || '';

      // Add note if images were stripped
      if (imagesStripped) {
        responseText = `[Note: Images were removed as model "${model}" does not support vision.]\n\n${responseText}`;
      }

      return {
        response: responseText,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime,
        model: data.model || model,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If the error suggests vision is not supported, update cache
      if (
        hasImageContent(messages as Array<{ role: string; content: unknown }>) &&
        /image_url|images?|multimodal|vision|content.?type/i.test(errorMessage) &&
        /not.?supported|unsupported|invalid/i.test(errorMessage)
      ) {
        setVisionCapability('vllm', endpoint, model, false, errorMessage.slice(0, 200));
      }

      return {
        response: '',
        error: errorMessage,
        responseTime: Date.now() - startTime,
      };
    }
  }

  async queryStream(
    messages: Array<{ role: string; content: MessageContent }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.endpoint && !options?.endpoint) {
      return {
        response: '',
        error: 'Endpoint is required for vLLM provider',
      };
    }

    const endpoint = options?.endpoint || this.endpoint!;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      // Prepare messages (may strip images if vision not supported)
      const { messages: preparedMessages, imagesStripped } = await this.prepareMessages(
        messages,
        endpoint,
        apiKey,
        model
      );

      // If images were stripped, emit a note first
      if (imagesStripped) {
        const note = `[Note: Images were removed as model "${model}" does not support vision.]\n\n`;
        onChunk(note);
      }

      const headers = buildOpenAIHeaders(apiKey, {}, true);

      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(preparedMessages, model, maxTokens, 'max_tokens', {
            stream: true,
            stream_options: { include_usage: true },
          })
        ),
      });

      if (!response.ok) {
        const error = await response.text();

        // If the error suggests vision is not supported, update cache
        if (
          hasImageContent(messages as Array<{ role: string; content: unknown }>) &&
          /image_url|images?|multimodal|vision|content.?type/i.test(error) &&
          /not.?supported|unsupported|invalid/i.test(error)
        ) {
          setVisionCapability('vllm', endpoint, model, false, error.slice(0, 200));
        }

        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const { fullText, tokensIn, tokensOut, model: returnedModel } =
        await parseOpenAIStream(response, onChunk, model);

      // Build final response text
      let responseText = fullText;
      if (imagesStripped) {
        responseText = `[Note: Images were removed as model "${model}" does not support vision.]\n\n${fullText}`;
      }

      return {
        response: responseText,
        tokensIn,
        tokensOut,
        responseTime: Date.now() - startTime,
        model: returnedModel,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.endpoint) {
      return { valid: false, error: 'Endpoint is required' };
    }

    try {
      const headers = buildOpenAIHeaders(this.apiKey);

      const response = await this.makeRequest(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers,
      });

      await response.json();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to connect to vLLM endpoint',
      };
    }
  }

  /**
   * Probe vision support for a specific model.
   * Useful for UI to determine if vision features should be shown.
   */
  async probeModelVisionSupport(model: string): Promise<boolean> {
    if (!this.endpoint) {
      return false;
    }
    return this.checkVisionSupport(this.endpoint, this.apiKey, model);
  }
}
