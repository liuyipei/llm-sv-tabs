/**
 * Tests for provider adapters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProviderEndpoint,
  getProviderHeaders,
  buildMessages,
  getApiKeyFromEnv,
  providerRequiresApiKey,
  providerRequiresEndpoint,
} from '../../src/probe/provider-adapters';

describe('provider-adapters', () => {
  describe('getProviderEndpoint', () => {
    it('should return OpenAI endpoint', () => {
      const endpoint = getProviderEndpoint('openai');
      expect(endpoint).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should return Anthropic endpoint', () => {
      const endpoint = getProviderEndpoint('anthropic');
      expect(endpoint).toBe('https://api.anthropic.com/v1/messages');
    });

    it('should return Gemini endpoint', () => {
      const endpoint = getProviderEndpoint('gemini');
      expect(endpoint).toContain('generativelanguage.googleapis.com');
    });

    it('should use custom endpoint for local providers', () => {
      const endpoint = getProviderEndpoint('ollama', 'http://custom:8080');
      expect(endpoint).toBe('http://custom:8080/v1/chat/completions');
    });

    it('should not append path if already present', () => {
      const endpoint = getProviderEndpoint(
        'openai',
        'http://custom/v1/chat/completions'
      );
      expect(endpoint).toBe('http://custom/v1/chat/completions');
    });

    it('should append /v1/messages for anthropic custom endpoint', () => {
      const endpoint = getProviderEndpoint('anthropic', 'http://custom');
      expect(endpoint).toBe('http://custom/v1/messages');
    });
  });

  describe('getProviderHeaders', () => {
    it('should include Authorization for OpenAI', () => {
      const headers = getProviderHeaders('openai', 'sk-test');
      expect(headers['Authorization']).toBe('Bearer sk-test');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include x-api-key for Anthropic', () => {
      const headers = getProviderHeaders('anthropic', 'sk-ant-test');
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should include extra headers for OpenRouter', () => {
      const headers = getProviderHeaders('openrouter', 'or-test');
      expect(headers['Authorization']).toBe('Bearer or-test');
      expect(headers['HTTP-Referer']).toBeDefined();
      expect(headers['X-Title']).toBeDefined();
    });

    it('should work without API key for local providers', () => {
      const headers = getProviderHeaders('ollama');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('buildMessages', () => {
    describe('text content', () => {
      it('should build simple text message', () => {
        const messages = buildMessages('openai', 'Hello', 'text');
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
          role: 'user',
          content: 'Hello',
        });
      });

      it('should work the same for all providers with text', () => {
        const openai = buildMessages('openai', 'Test', 'text');
        const anthropic = buildMessages('anthropic', 'Test', 'text');
        const gemini = buildMessages('gemini', 'Test', 'text');

        // All should have simple string content for text-only
        expect(openai[0].content).toBe('Test');
        expect(anthropic[0].content).toBe('Test');
        expect(gemini[0].content).toBe('Test');
      });
    });

    describe('image content', () => {
      const imageMedia = {
        base64: 'iVBORw0KGgoAAAANSUhEUg==',
        mimeType: 'image/png',
      };

      it('should build OpenAI-style image message', () => {
        const messages = buildMessages('openai', 'Describe', 'image', imageMedia);
        expect(messages).toHaveLength(1);

        const content = messages[0].content as any[];
        expect(content).toHaveLength(2);
        expect(content[0].type).toBe('text');
        expect(content[1].type).toBe('image_url');
        expect(content[1].image_url.url).toContain('data:image/png;base64,');
      });

      it('should build Anthropic-style image message', () => {
        const messages = buildMessages('anthropic', 'Describe', 'image', imageMedia);
        expect(messages).toHaveLength(1);

        const content = messages[0].content as any[];
        expect(content).toHaveLength(2);
        expect(content[0].type).toBe('text');
        expect(content[1].type).toBe('image');
        expect(content[1].source.type).toBe('base64');
        expect(content[1].source.media_type).toBe('image/png');
      });

      it('should support images-first ordering', () => {
        const messages = buildMessages(
          'openai',
          'Describe',
          'image',
          imageMedia,
          true // imagesFirst
        );

        const content = messages[0].content as any[];
        expect(content[0].type).toBe('image_url');
        expect(content[1].type).toBe('text');
      });

      it('should handle data URL input', () => {
        const dataUrlMedia = {
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        };

        const messages = buildMessages('openai', 'Describe', 'image', dataUrlMedia);
        const content = messages[0].content as any[];
        expect(content[1].image_url.url).toBe(dataUrlMedia.dataUrl);
      });
    });

    describe('PDF content', () => {
      const pdfMedia = {
        base64: 'JVBERi0xLjQK',
        mimeType: 'application/pdf',
      };

      it('should build Anthropic-style PDF message (document)', () => {
        const messages = buildMessages('anthropic', 'Summarize', 'pdf', pdfMedia);
        const content = messages[0].content as any[];

        expect(content).toHaveLength(2);
        expect(content[0].type).toBe('text');
        expect(content[1].type).toBe('document');
        expect(content[1].source.type).toBe('base64');
        expect(content[1].source.media_type).toBe('application/pdf');
      });

      it('should build OpenAI-style PDF message (file)', () => {
        const messages = buildMessages('openai', 'Summarize', 'pdf', pdfMedia);
        const content = messages[0].content as any[];

        expect(content).toHaveLength(2);
        expect(content[0].type).toBe('text');
        expect(content[1].type).toBe('file');
        expect(content[1].file.type).toBe('application/pdf');
      });
    });
  });

  describe('getApiKeyFromEnv', () => {
    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai');
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    });

    it('should return API key from environment', () => {
      expect(getApiKeyFromEnv('openai')).toBe('sk-test-openai');
      expect(getApiKeyFromEnv('anthropic')).toBe('sk-ant-test');
    });

    it('should return undefined for missing key', () => {
      expect(getApiKeyFromEnv('minimax')).toBeUndefined();
    });
  });

  describe('providerRequiresApiKey', () => {
    it('should return true for cloud providers', () => {
      expect(providerRequiresApiKey('openai')).toBe(true);
      expect(providerRequiresApiKey('anthropic')).toBe(true);
      expect(providerRequiresApiKey('gemini')).toBe(true);
      expect(providerRequiresApiKey('openrouter')).toBe(true);
    });

    it('should return false for local providers', () => {
      expect(providerRequiresApiKey('ollama')).toBe(false);
      expect(providerRequiresApiKey('lmstudio')).toBe(false);
      expect(providerRequiresApiKey('vllm')).toBe(false);
      expect(providerRequiresApiKey('local-openai-compatible')).toBe(false);
    });
  });

  describe('providerRequiresEndpoint', () => {
    it('should return true for local providers', () => {
      expect(providerRequiresEndpoint('ollama')).toBe(true);
      expect(providerRequiresEndpoint('lmstudio')).toBe(true);
      expect(providerRequiresEndpoint('vllm')).toBe(true);
    });

    it('should return false for cloud providers', () => {
      expect(providerRequiresEndpoint('openai')).toBe(false);
      expect(providerRequiresEndpoint('anthropic')).toBe(false);
      expect(providerRequiresEndpoint('gemini')).toBe(false);
    });
  });
});
