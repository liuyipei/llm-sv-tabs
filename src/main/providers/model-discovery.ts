/**
 * Model discovery system for LLM providers
 */

import type { ProviderType, LLMModel } from '../../types';
import { ProviderFactory } from './provider-factory.js';

export class ModelDiscovery {
  /**
   * Discover available models for a provider
   */
  static async discoverModels(
    providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ): Promise<LLMModel[]> {
    try {
      const provider = ProviderFactory.getProvider(providerType, apiKey, endpoint);
      return await provider.getAvailableModels();
    } catch (error) {
      console.error(`Failed to discover models for ${providerType}:`, error);
      return [];
    }
  }

  /**
   * Discover models for all configured providers
   */
  static async discoverAllModels(
    configs: Array<{
      provider: ProviderType;
      apiKey?: string;
      endpoint?: string;
    }>
  ): Promise<Map<ProviderType, LLMModel[]>> {
    const results = new Map<ProviderType, LLMModel[]>();

    await Promise.all(
      configs.map(async ({ provider, apiKey, endpoint }) => {
        const models = await this.discoverModels(provider, apiKey, endpoint);
        results.set(provider, models);
      })
    );

    return results;
  }

  /**
   * Get default model for a provider
   */
  static getDefaultModel(providerType: ProviderType): string | null {
    const defaults: Record<ProviderType, string> = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20241022',
      gemini: 'gemini-2.0-flash-exp',
      xai: 'grok-2-latest',
      openrouter: 'anthropic/claude-3.5-sonnet',
      fireworks: 'accounts/fireworks/models/deepseek-v3p1',
      ollama: 'llama3.2',
      lmstudio: 'local-model',
      vllm: 'default',
      minimax: 'abab6.5-chat',
      'local-openai-compatible': 'default',
    };

    return defaults[providerType] || null;
  }

  /**
   * Validate provider configuration
   */
  static async validateProvider(
    providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const provider = ProviderFactory.getProvider(providerType, apiKey, endpoint);
      return await provider.validate();
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get provider display name
   */
  static getProviderDisplayName(providerType: ProviderType): string {
    const names: Record<ProviderType, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic (Claude)',
      gemini: 'Google Gemini',
      xai: 'xAI (Grok)',
      openrouter: 'OpenRouter',
      fireworks: 'Fireworks AI',
      ollama: 'Ollama (Local)',
      lmstudio: 'LM Studio (Local)',
      vllm: 'vLLM (Local)',
      minimax: 'Minimax',
      'local-openai-compatible': 'OpenAI-Compatible',
    };

    return names[providerType] || providerType;
  }

  /**
   * Check if provider requires API key
   */
  static requiresApiKey(providerType: ProviderType): boolean {
    const requiresKey: ProviderType[] = [
      'openai',
      'anthropic',
      'gemini',
      'xai',
      'openrouter',
      'fireworks',
      'minimax',
    ];

    return requiresKey.includes(providerType);
  }

  /**
   * Check if provider requires endpoint configuration
   */
  static requiresEndpoint(providerType: ProviderType): boolean {
    const requiresEndpoint: ProviderType[] = [
      'ollama',
      'lmstudio',
      'vllm',
      'local-openai-compatible',
    ];

    return requiresEndpoint.includes(providerType);
  }
}
