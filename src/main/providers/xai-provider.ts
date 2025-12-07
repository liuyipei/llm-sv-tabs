/**
 * xAI (Grok) provider implementation
 */

import type { LLMModel } from '../../types';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';

export class XAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super('xai', 'https://api.x.ai/v1', apiKey, {
      capabilities: {
        supportsVision: true,
        requiresApiKey: true,
        requiresEndpoint: false,
      },
      defaultModel: 'grok-beta',
    });
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    return [
      {
        id: 'grok-2-1212',
        name: 'Grok 2 (December 2024)',
        provider: 'xai',
        contextWindow: 131072,
        supportsVision: true,
      },
      {
        id: 'grok-2-vision-1212',
        name: 'Grok 2 Vision (December 2024)',
        provider: 'xai',
        contextWindow: 8192,
        supportsVision: true,
      },
      {
        id: 'grok-beta',
        name: 'Grok Beta',
        provider: 'xai',
        contextWindow: 131072,
        supportsVision: false,
      },
    ];
  }

}
