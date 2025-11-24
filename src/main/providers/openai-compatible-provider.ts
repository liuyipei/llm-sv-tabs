/**
 * Generic OpenAI-compatible provider (for LM Studio, vLLM, etc.)
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, ProviderType } from '../../types';

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(
    providerType: ProviderType = 'local-openai-compatible',
    endpoint?: string,
    apiKey?: string
  ) {
    super(providerType, apiKey, endpoint);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: false, // Depends on the specific provider
      requiresApiKey: false, // Optional for local providers
      requiresEndpoint: true,
      supportsSystemPrompt: true,
    };
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.endpoint) {
      return [];
    }

    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await this.makeRequest(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers,
      });

      const data = await response.json() as { data?: Array<{ id: string }> };

      return (data.data || []).map(model => ({
        id: model.id,
        name: model.id,
        provider: this.providerType,
      }));
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.endpoint && !options?.endpoint) {
      return {
        response: '',
        error: 'Endpoint is required for OpenAI-compatible providers',
      };
    }

    // Check if API key is required for cloud providers
    const cloudProviders: string[] = ['fireworks', 'openrouter', 'xai', 'gemini', 'minimax'];
    if (cloudProviders.includes(this.providerType) && !this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: `API key is required for ${this.providerType}`,
      };
    }

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await this.makeRequest(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.choices[0]?.message?.content || '',
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime,
        model: data.model || model,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  async queryStream(
    messages: Array<{ role: string; content: MessageContent }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.endpoint && !options?.endpoint) {
      return {
        response: '',
        error: 'Endpoint is required for OpenAI-compatible providers',
      };
    }

    // Check if API key is required for cloud providers
    const cloudProviders: string[] = ['fireworks', 'openrouter', 'xai', 'gemini', 'minimax'];
    if (cloudProviders.includes(this.providerType) && !this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: `API key is required for ${this.providerType}`,
      };
    }

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || 'default';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let returnedModel = model;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
            if (parsed.model) {
              returnedModel = parsed.model;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      return {
        response: fullText,
        responseTime: Date.now() - startTime,
        model: returnedModel,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.endpoint) {
      return { valid: false, error: 'Endpoint is required' };
    }

    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await this.makeRequest(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers,
      });

      await response.json();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to connect to endpoint',
      };
    }
  }
}
