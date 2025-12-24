import type { ProviderType } from '../../types';

/**
 * Default models for each provider (fallback when no discovered models available).
 * These are the recommended starting points for each provider.
 */
export const defaultModels: Record<ProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  xai: ['grok-2-latest', 'grok-2-vision-latest'],
  fireworks: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
  ollama: ['llama3.2', 'mistral', 'codellama'],
  lmstudio: ['local-model'],
  vllm: ['default'],
  'local-openai-compatible': ['default'],
  openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
  minimax: ['abab6.5-chat'],
};

/**
 * Providers that require API keys for authentication.
 */
export const providersRequiringApiKey: ProviderType[] = [
  'openai',
  'anthropic',
  'gemini',
  'xai',
  'openrouter',
  'fireworks',
  'minimax',
];

/**
 * Get the first default model for a provider.
 */
export function getDefaultModel(provider: ProviderType): string | null {
  const models = defaultModels[provider];
  return models && models.length > 0 ? models[0] : null;
}
