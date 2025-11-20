import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../../src/main/providers/openai-provider';
import { AnthropicProvider } from '../../src/main/providers/anthropic-provider';
import { OllamaProvider } from '../../src/main/providers/ollama-provider';
import { OpenAICompatibleProvider } from '../../src/main/providers/openai-compatible-provider';

describe('Provider Capabilities', () => {
  describe('OpenAI Provider', () => {
    it('should have correct capabilities', () => {
      const provider = new OpenAIProvider();
      const caps = provider.getCapabilities();

      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.requiresApiKey).toBe(true);
      expect(caps.requiresEndpoint).toBe(false);
      expect(caps.supportsSystemPrompt).toBe(true);
    });

    it('should return available models', async () => {
      const provider = new OpenAIProvider();
      const models = await provider.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gpt-4o'))).toBe(true);
      expect(models.every(m => m.provider === 'openai')).toBe(true);
    });
  });

  describe('Anthropic Provider', () => {
    it('should have correct capabilities', () => {
      const provider = new AnthropicProvider();
      const caps = provider.getCapabilities();

      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.requiresApiKey).toBe(true);
      expect(caps.requiresEndpoint).toBe(false);
    });

    it('should return available models', async () => {
      const provider = new AnthropicProvider();
      const models = await provider.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('claude'))).toBe(true);
      expect(models.every(m => m.provider === 'anthropic')).toBe(true);
    });
  });

  describe('Ollama Provider', () => {
    it('should have correct capabilities', () => {
      const provider = new OllamaProvider();
      const caps = provider.getCapabilities();

      expect(caps.requiresApiKey).toBe(false);
      expect(caps.requiresEndpoint).toBe(true);
      expect(caps.supportsSystemPrompt).toBe(true);
    });
  });

  describe('OpenAI Compatible Provider', () => {
    it('should have correct capabilities', () => {
      const provider = new OpenAICompatibleProvider('lmstudio', 'http://localhost:1234');
      const caps = provider.getCapabilities();

      expect(caps.requiresApiKey).toBe(false);
      expect(caps.requiresEndpoint).toBe(true);
    });

    it('should support different provider types', () => {
      const lmstudio = new OpenAICompatibleProvider('lmstudio');
      const vllm = new OpenAICompatibleProvider('vllm');

      expect(lmstudio.getType()).toBe('lmstudio');
      expect(vllm.getType()).toBe('vllm');
    });
  });
});
