/**
 * Fireworks AI provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions } from '../../types';

interface FireworksModel {
  name: string;
  displayName?: string;
  description?: string;
  contextLength?: number;
  supportsImageInput?: boolean;
  supportsTools?: boolean;
  state?: string;
  public?: boolean;
}

interface FireworksListModelsResponse {
  models: FireworksModel[];
  nextPageToken?: string;
  totalSize?: number;
}

export class FireworksProvider extends BaseProvider {
  private readonly baseUrl = 'https://api.fireworks.ai';
  private readonly inferenceUrl = 'https://api.fireworks.ai/inference/v1';
  private accountId: string;

  constructor(apiKey?: string, accountId: string = 'fireworks') {
    super('fireworks', apiKey);
    this.accountId = accountId;
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

  /**
   * Set the account ID for Fireworks API calls
   */
  setAccountId(accountId: string): void {
    this.accountId = accountId;
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.apiKey) {
      console.warn('Fireworks API key not set, returning empty model list');
      return [];
    }

    try {
      const url = `${this.baseUrl}/v1/accounts/${this.accountId}/models`;
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const data = (await response.json()) as FireworksListModelsResponse;

      // Filter for READY state and public models, map to LLMModel format
      return (data.models || [])
        .filter((model) => model.state === 'READY' || !model.state)
        .map((model) => ({
          id: model.name,
          name: model.displayName || model.name.split('/').pop() || model.name,
          provider: 'fireworks' as const,
          contextWindow: model.contextLength,
          supportsVision: model.supportsImageInput,
          description: model.description,
        }));
    } catch (error) {
      console.error('Failed to fetch Fireworks models:', error);
      return [];
    }
  }

  async query(
    messages: Array<{ role: string; content: string }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required for Fireworks' };
    }

    const model = options?.model || 'accounts/fireworks/models/llama-v3p1-70b-instruct';
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      };

      const url = `${this.inferenceUrl}/chat/completions`;
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return { response: '', error: 'No response from Fireworks' };
      }

      return {
        response: data.choices[0].message.content,
        tokensUsed: data.usage?.total_tokens,
        responseTime: Date.now() - startTime,
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

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Try to fetch models to validate the API key
      const url = `${this.baseUrl}/v1/accounts/${this.accountId}/models`;
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
