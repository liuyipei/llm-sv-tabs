/**
 * Provider factory for creating LLM provider instances
 */

import type { ProviderType } from '../../types';
import { BaseProvider } from './base-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { XAIProvider } from './xai-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { MinimaxProvider } from './minimax-provider.js';
import { FireworksProvider } from './fireworks-provider.js';

export class ProviderFactory {
  private static providers: Map<string, BaseProvider> = new Map();

  /**
   * Create or get a provider instance
   */
  static getProvider(
    providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ): BaseProvider {
    const cacheKey = `${providerType}:${apiKey || ''}:${endpoint || ''}`;

    // Return cached instance if available
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    // Create new provider instance
    let provider: BaseProvider;

    switch (providerType) {
      case 'openai':
        provider = new OpenAIProvider(apiKey);
        break;

      case 'anthropic':
        provider = new AnthropicProvider(apiKey);
        break;

      case 'ollama':
        provider = new OllamaProvider(endpoint);
        break;

      case 'lmstudio':
        provider = new OpenAICompatibleProvider('lmstudio', endpoint || 'http://localhost:1234', apiKey);
        break;

      case 'vllm':
        provider = new OpenAICompatibleProvider('vllm', endpoint, apiKey);
        break;

      case 'local-openai-compatible':
        provider = new OpenAICompatibleProvider('local-openai-compatible', endpoint, apiKey);
        break;

      case 'fireworks':
        provider = new FireworksProvider(apiKey);
        break;

      case 'gemini':
        provider = new GeminiProvider(apiKey);
        break;

      case 'xai':
        provider = new XAIProvider(apiKey);
        break;

      case 'openrouter':
        provider = new OpenRouterProvider(apiKey);
        break;

      case 'minimax':
        provider = new MinimaxProvider(apiKey);
        break;

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }

    // Cache the provider instance
    this.providers.set(cacheKey, provider);

    return provider;
  }

  /**
   * Clear provider cache
   */
  static clearCache(): void {
    this.providers.clear();
  }

  /**
   * Update provider configuration
   */
  static updateProvider(
    providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ): BaseProvider {
    // Clear old cache entry
    const oldKeys = Array.from(this.providers.keys()).filter(key =>
      key.startsWith(`${providerType}:`)
    );
    oldKeys.forEach(key => this.providers.delete(key));

    // Create new provider with updated config
    return this.getProvider(providerType, apiKey, endpoint);
  }

  /**
   * Get list of all supported providers
   */
  static getSupportedProviders(): ProviderType[] {
    return [
      'openai',
      'anthropic',
      'gemini',
      'xai',
      'openrouter',
      'fireworks',
      'ollama',
      'lmstudio',
      'vllm',
      'minimax',
      'local-openai-compatible',
    ];
  }
}
