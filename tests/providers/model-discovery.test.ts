import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelDiscovery } from '../../src/main/providers/model-discovery';
import { ProviderFactory } from '../../src/main/providers/provider-factory';

describe('ModelDiscovery', () => {
  it('should return default model for OpenAI', () => {
    const defaultModel = ModelDiscovery.getDefaultModel('openai');
    expect(defaultModel).toBe('gpt-4o-mini');
  });

  it('should return default model for Anthropic', () => {
    const defaultModel = ModelDiscovery.getDefaultModel('anthropic');
    expect(defaultModel).toBe('claude-3-5-sonnet-20241022');
  });

  it('should return default model for Ollama', () => {
    const defaultModel = ModelDiscovery.getDefaultModel('ollama');
    expect(defaultModel).toBe('llama3.2');
  });

  it('should identify providers that require API keys', () => {
    expect(ModelDiscovery.requiresApiKey('openai')).toBe(true);
    expect(ModelDiscovery.requiresApiKey('anthropic')).toBe(true);
    expect(ModelDiscovery.requiresApiKey('ollama')).toBe(false);
    expect(ModelDiscovery.requiresApiKey('lmstudio')).toBe(false);
  });

  it('should identify providers that require endpoints', () => {
    expect(ModelDiscovery.requiresEndpoint('openai')).toBe(false);
    expect(ModelDiscovery.requiresEndpoint('anthropic')).toBe(false);
    expect(ModelDiscovery.requiresEndpoint('ollama')).toBe(true);
    expect(ModelDiscovery.requiresEndpoint('lmstudio')).toBe(true);
    expect(ModelDiscovery.requiresEndpoint('vllm')).toBe(true);
  });

  it('should return correct provider display names', () => {
    expect(ModelDiscovery.getProviderDisplayName('openai')).toBe('OpenAI');
    expect(ModelDiscovery.getProviderDisplayName('anthropic')).toBe('Anthropic (Claude)');
    expect(ModelDiscovery.getProviderDisplayName('ollama')).toBe('Ollama (Local)');
  });

  it('should discover models from static providers', async () => {
    const models = await ModelDiscovery.discoverModels('openai', 'fake-key');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('provider');
    expect(models[0].provider).toBe('openai');
  });

  it('should propagate errors from provider instead of swallowing them', async () => {
    // Mock ProviderFactory to return a provider that throws an error
    const mockProvider = {
      getAvailableModels: vi.fn().mockRejectedValue(new Error('HTTP 401: Unauthorized')),
      getType: () => 'fireworks',
    };

    const getProviderSpy = vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);

    // Verify that discoverModels() re-throws the error instead of returning []
    await expect(ModelDiscovery.discoverModels('fireworks', 'bad-api-key')).rejects.toThrow('HTTP 401: Unauthorized');

    // Clean up
    getProviderSpy.mockRestore();
  });
});
