/**
 * Anthropic (Claude) provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';

export class AnthropicProvider extends BaseProvider {
  private static readonly API_BASE = 'https://api.anthropic.com/v1';
  private static readonly MODELS: LLMModel[] = [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, supportsVision: false },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
  ];

  constructor(apiKey?: string) {
    super('anthropic', apiKey);
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
    return AnthropicProvider.MODELS;
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    if (!this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: 'Anthropic API key is required',
      };
    }

    const apiKey = (options?.apiKey || this.apiKey)!; // Non-null assertion - we validated above
    const model = options?.model || this.model || 'claude-3-5-sonnet-20241022';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      // Anthropic API expects system messages separately
      const systemMessages = messages.filter(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: userMessages,
          system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.content[0]?.text || '',
        tokensIn: data.usage?.input_tokens,
        tokensOut: data.usage?.output_tokens,
        responseTime,
        model: data.model,
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

    if (!this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: 'Anthropic API key is required',
      };
    }

    const apiKey = (options?.apiKey || this.apiKey)!;
    const model = options?.model || this.model || 'claude-3-5-sonnet-20241022';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      // Anthropic API expects system messages separately
      const systemMessages = messages.filter(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await fetch(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: userMessages,
          system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
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
      let tokensIn = 0;
      let tokensOut = 0;
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

            if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta?.text || '';
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            } else if (parsed.type === 'message_start') {
              tokensIn = parsed.message?.usage?.input_tokens || 0;
            } else if (parsed.type === 'message_delta') {
              tokensOut = parsed.usage?.output_tokens || 0;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        response: fullText,
        tokensIn,
        tokensOut,
        responseTime,
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
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Make a minimal request to validate the API key
      const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      });

      await response.json();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid API key',
      };
    }
  }
}
