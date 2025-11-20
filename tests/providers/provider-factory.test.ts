import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../../src/main/providers/provider-factory';
import { OpenAIProvider } from '../../src/main/providers/openai-provider';
import { AnthropicProvider } from '../../src/main/providers/anthropic-provider';
import { OllamaProvider } from '../../src/main/providers/ollama-provider';

describe('ProviderFactory', () => {
  it('should create OpenAI provider instance', () => {
    const provider = ProviderFactory.getProvider('openai', 'test-key');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.getType()).toBe('openai');
  });

  it('should create Anthropic provider instance', () => {
    const provider = ProviderFactory.getProvider('anthropic', 'test-key');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.getType()).toBe('anthropic');
  });

  it('should create Ollama provider instance', () => {
    const provider = ProviderFactory.getProvider('ollama', undefined, 'http://localhost:11434');
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.getType()).toBe('ollama');
  });

  it('should return supported providers list', () => {
    const providers = ProviderFactory.getSupportedProviders();
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
    expect(providers).toContain('ollama');
    expect(providers).toContain('lmstudio');
    expect(providers.length).toBeGreaterThan(5);
  });

  it('should cache provider instances', () => {
    const provider1 = ProviderFactory.getProvider('openai', 'test-key');
    const provider2 = ProviderFactory.getProvider('openai', 'test-key');
    expect(provider1).toBe(provider2);
  });

  it('should create new instance when config changes', () => {
    const provider1 = ProviderFactory.getProvider('openai', 'key1');
    const provider2 = ProviderFactory.getProvider('openai', 'key2');
    expect(provider1).not.toBe(provider2);
  });
});
