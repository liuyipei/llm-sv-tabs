/**
 * Fireworks AI provider implementation (Serverless)
 */

import type { LLMModel } from '../../types';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class FireworksProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super('fireworks', 'https://api.fireworks.ai/inference', apiKey, {
      capabilities: {
        supportsVision: true,
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      defaultModel: 'accounts/fireworks/models/deepseek-v3p1',
      paths: {
        chatCompletions: '/v1/chat/completions',
        models: '/v1/models',
      },
    });
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.apiKey) {
      console.warn('Fireworks API key not set, returning empty model list');
      return [];
    }

    try {
      if (!this.endpoint) {
        return [];
      }

      const url = `${this.endpoint}/v1/models`;
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const data = (await response.json()) as { data?: Array<{ id: string }> };

      // Map to LLMModel format
      return (data.data || []).map((model) => ({
        id: model.id,
        name: model.id.split('/').pop() || model.id,
        provider: 'fireworks' as const,
      }));
    } catch (error) {
      console.error('Failed to fetch Fireworks models:', error);
      return [];
    }
  }

}
