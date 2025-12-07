/**
 * OpenRouter provider implementation
 */

import type { LLMModel } from '../../types';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/your-username/llm-sv-tabs',
  'X-Title': 'LLM SV Tabs',
};

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super('openrouter', 'https://openrouter.ai/api/v1', apiKey, {
      capabilities: {
        supportsVision: true,
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      defaultModel: 'anthropic/claude-3.5-sonnet',
      extraHeaders: OPENROUTER_HEADERS,
    });
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

}
