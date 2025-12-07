/**
 * Minimax provider implementation
 */

import type { LLMModel } from '../../types';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class MinimaxProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super('minimax', 'https://api.minimax.chat/v1', apiKey, {
      capabilities: {
        supportsVision: false,
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      defaultModel: 'abab6.5-chat',
      paths: {
        chatCompletions: '/text/chatcompletion_v2',
        models: '/models',
      },
    });
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    return [
      {
        id: 'abab6.5-chat',
        name: 'Abab 6.5 Chat',
        provider: 'minimax',
        contextWindow: 245000,
        supportsVision: false,
      },
      {
        id: 'abab6.5s-chat',
        name: 'Abab 6.5s Chat',
        provider: 'minimax',
        contextWindow: 245000,
        supportsVision: false,
      },
      {
        id: 'abab5.5-chat',
        name: 'Abab 5.5 Chat',
        provider: 'minimax',
        contextWindow: 16384,
        supportsVision: false,
      },
    ];
  }

}
