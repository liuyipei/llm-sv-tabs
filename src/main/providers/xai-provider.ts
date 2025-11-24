/**
 * xAI (Grok) provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';

export class XAIProvider extends BaseProvider {
  private readonly baseUrl = 'https://api.x.ai/v1';

  constructor(apiKey?: string) {
    super('xai', apiKey);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: true,
      requiresApiKey: true,
      requiresEndpoint: false,
      supportsSystemPrompt: true,
    };
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

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required' };
    }

    const model = options?.model || 'grok-beta';
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      };

      const url = `${this.baseUrl}/chat/completions`;
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return { response: '', error: 'No response from xAI' };
      }

      return {
        response: data.choices[0].message.content,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime: Date.now() - startTime,
        model,
      };
    } catch (error) {
      return {
        response: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async queryStream(
    messages: Array<{ role: string; content: MessageContent }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required' };
    }

    const model = options?.model || 'grok-beta';
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        stream: true,
      };

      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      const url = `${this.baseUrl}/models`;
      await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
