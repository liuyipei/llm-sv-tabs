/**
 * vLLM provider implementation with Qwen3-VL vision support
 *
 * vLLM exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * For vision-language models like Qwen3-VL, messages can include
 * multimodal content with both text and image_url parts.
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import {
  buildOpenAIChatBody,
  buildOpenAIHeaders,
  parseOpenAIStream,
} from './openai-helpers.js';

/**
 * Patterns used to detect vision-language models by name.
 * Models matching these patterns will have supportsVision: true.
 */
const VISION_MODEL_PATTERNS = [
  /qwen.*vl/i,        // Qwen-VL, Qwen2-VL, Qwen3-VL
  /qwen.*vision/i,    // Qwen-Vision variants
  /llava/i,           // LLaVA models
  /cogvlm/i,          // CogVLM
  /internvl/i,        // InternVL
  /phi.*vision/i,     // Phi-Vision
  /minicpm.*v/i,      // MiniCPM-V
  /deepseek.*vl/i,    // DeepSeek-VL
  /yi.*vl/i,          // Yi-VL
  /glm.*v/i,          // GLM-4V
  /-vl\b/i,           // Generic -VL suffix
  /vision/i,          // Generic vision keyword
];

/**
 * Check if a model name indicates vision capability
 */
function isVisionModel(modelId: string): boolean {
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
}

export class VLLMProvider extends BaseProvider {
  constructor(endpoint?: string, apiKey?: string) {
    super('vllm', apiKey, endpoint);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: true, // vLLM supports vision when running VLMs like Qwen3-VL
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

      const data = (await response.json()) as { data?: Array<{ id: string }> };

      return (data.data || []).map(model => ({
        id: model.id,
        name: model.id,
        provider: 'vllm' as const,
        supportsVision: isVisionModel(model.id),
      }));
    } catch (error) {
      console.error('Failed to fetch vLLM models:', error);
      return [];
    }
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

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers = buildOpenAIHeaders(apiKey);

      const response = await this.makeRequest(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(messages, model, maxTokens, 'max_tokens')
        ),
      });

      const data = (await response.json()) as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.choices[0]?.message?.content || '',
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime,
        model: data.model || model,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
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

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers = buildOpenAIHeaders(apiKey, {}, true);

      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(messages, model, maxTokens, 'max_tokens', {
            stream: true,
            stream_options: { include_usage: true },
          })
        ),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const { fullText, tokensIn, tokensOut, model: returnedModel } =
        await parseOpenAIStream(response, onChunk, model);

      return {
        response: fullText,
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
}
