/**
 * OpenAI provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import { buildOpenAIChatBody, buildOpenAIHeaders, parseOpenAIStream } from './openai-helpers.js';
import {
  hasImageContent,
  stripImageContent,
  prepareMessagesWithVisionCheck,
  type ModelVisionInfo,
} from './vision-capability-probe.js';

export class OpenAIProvider extends BaseProvider {
  private static readonly API_BASE = 'https://api.openai.com/v1';
  private static readonly MODELS: LLMModel[] = [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, supportsVision: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, supportsVision: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextWindow: 128000, supportsVision: true },
    { id: 'gpt-4', name: 'GPT-4', provider: 'openai', contextWindow: 8192, supportsVision: false },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', contextWindow: 16385, supportsVision: false },
  ];

  constructor(apiKey?: string) {
    super('openai', apiKey);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: true,
      requiresApiKey: true,
      requiresEndpoint: false,
      supportsSystemPrompt: true,
    };
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.apiKey) {
      return OpenAIProvider.MODELS;
    }

    try {
      const response = await this.makeRequest(`${OpenAIProvider.API_BASE}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      const data = await response.json() as { data?: Array<{ id: string }> };

      const models = (data.data || []).map(model => this.mapModelMetadata(model.id));
      return models.length > 0 ? models : OpenAIProvider.MODELS;
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      return OpenAIProvider.MODELS;
    }
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: 'OpenAI API key is required',
      };
    }

    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'gpt-4o-mini';
    const maxTokens = options?.maxTokens ?? 4096;

    // Check vision support and prepare messages
    const hasImages = hasImageContent(messages as Array<{ role: string; content: unknown }>);
    const { messages: preparedMessages, imagesStripped, warning } = prepareMessagesWithVisionCheck(
      messages,
      model,
      OpenAIProvider.MODELS as ModelVisionInfo[],
      hasImages,
      (msgs) => stripImageContent(msgs as Array<{ role: string; content: unknown }>) as typeof msgs
    );

    try {
      const response = await this.makeRequest(`${OpenAIProvider.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(apiKey),
        body: JSON.stringify(
          buildOpenAIChatBody(preparedMessages, model, maxTokens, 'max_completion_tokens'),
        ),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      let responseText = data.choices[0]?.message?.content || '';

      // Prepend warning if images were stripped
      if (imagesStripped && warning) {
        responseText = `[Note: ${warning}]\n\n${responseText}`;
      }

      return {
        response: responseText,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime,
        model: data.model,
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

    if (!this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: 'OpenAI API key is required',
      };
    }

    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'gpt-4o-mini';
    const maxTokens = options?.maxTokens ?? 4096;

    // Check vision support and prepare messages
    const hasImages = hasImageContent(messages as Array<{ role: string; content: unknown }>);
    const { messages: preparedMessages, imagesStripped, warning } = prepareMessagesWithVisionCheck(
      messages,
      model,
      OpenAIProvider.MODELS as ModelVisionInfo[],
      hasImages,
      (msgs) => stripImageContent(msgs as Array<{ role: string; content: unknown }>) as typeof msgs
    );

    // Emit warning first if images were stripped
    if (imagesStripped && warning) {
      onChunk(`[Note: ${warning}]\n\n`);
    }

    try {
      const response = await fetch(`${OpenAIProvider.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: buildOpenAIHeaders(apiKey, {}, true),
        body: JSON.stringify(
          buildOpenAIChatBody(preparedMessages, model, maxTokens, 'max_completion_tokens', {
            stream: true,
            stream_options: { include_usage: true },
          }),
        ),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const { fullText, tokensIn, tokensOut, model: returnedModel } = await parseOpenAIStream(
        response,
        onChunk,
        model
      );

      // Include warning in final response text
      const responseText = imagesStripped && warning
        ? `[Note: ${warning}]\n\n${fullText}`
        : fullText;

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
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Try to list models as a validation check
      const response = await this.makeRequest(`${OpenAIProvider.API_BASE}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      await response.json();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid API key',
      };
    }
  }

  private mapModelMetadata(modelId: string): LLMModel {
    const knownModel = OpenAIProvider.MODELS.find(model => model.id === modelId);
    if (knownModel) {
      return knownModel;
    }

    return {
      id: modelId,
      name: modelId,
      provider: 'openai',
    };
  }
}
