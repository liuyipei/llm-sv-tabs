/**
 * OpenAI provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions } from '../../types';

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
    return OpenAIProvider.MODELS;
  }

  async query(
    messages: Array<{ role: string; content: string }>,
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
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const response = await this.makeRequest(`${OpenAIProvider.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.choices[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens,
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
}
