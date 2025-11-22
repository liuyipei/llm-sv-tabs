/**
 * OpenRouter provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions } from '../../types';

export class OpenRouterProvider extends BaseProvider {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey?: string) {
    super('openrouter', apiKey);
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
    // OpenRouter has many models - return popular ones
    return [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openrouter',
        contextWindow: 128000,
        supportsVision: true,
      },
      {
        id: 'google/gemini-pro-1.5',
        name: 'Gemini Pro 1.5',
        provider: 'openrouter',
        contextWindow: 2000000,
        supportsVision: true,
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        provider: 'openrouter',
        contextWindow: 131072,
        supportsVision: false,
      },
    ];
  }

  async query(
    messages: Array<{ role: string; content: string }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required' };
    }

    const model = options?.model || 'anthropic/claude-3.5-sonnet';
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      };

      const url = `${this.baseUrl}/chat/completions`;
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/your-username/llm-sv-tabs',
          'X-Title': 'LLM SV Tabs',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return { response: '', error: 'No response from OpenRouter' };
      }

      return {
        response: data.choices[0].message.content,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime: Date.now() - startTime,
        model,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // OpenRouter doesn't have a models endpoint that requires auth
      // So we'll do a minimal test query
      const url = `${this.baseUrl}/models`;
      await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
