/**
 * Anthropic (Claude) provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions } from '../../types';

export class AnthropicProvider extends BaseProvider {
  private static readonly API_BASE = 'https://api.anthropic.com/v1';
  private static readonly MODELS: LLMModel[] = [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, supportsVision: false },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
  ];

  constructor(apiKey?: string) {
    super('anthropic', apiKey);
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
    return AnthropicProvider.MODELS;
  }

  async query(
    messages: Array<{ role: string; content: string }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: 'Anthropic API key is required',
      };
    }

    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'claude-3-5-sonnet-20241022';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      // Anthropic API expects system messages separately
      const systemMessages = messages.filter(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: userMessages,
          system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.content[0]?.text || '',
        tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
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
      // Make a minimal request to validate the API key
      const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
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
