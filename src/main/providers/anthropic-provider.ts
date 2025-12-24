/**
 * Anthropic (Claude) provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import { buildCapabilityAwareMessage } from './message-builder.js';
import { fetchModelsWithFallback, readSSEStream, validateWithApiKey } from './provider-helpers.js';

export class AnthropicProvider extends BaseProvider {
  private static readonly API_BASE = 'https://api.anthropic.com/v1';
  // Anthropic requires a fixed version header for their API; this is the latest for the messages endpoint.
  private static readonly API_VERSION = '2023-06-01';
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
    return fetchModelsWithFallback(
      this.apiKey,
      AnthropicProvider.MODELS,
      async () => {
        const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/models`, {
          method: 'GET',
          headers: {
            'x-api-key': this.apiKey!,
            'anthropic-version': AnthropicProvider.API_VERSION,
          },
        });

        const data = await response.json() as { data?: Array<{ id: string }> };
        return (data.data || []).map(({ id }) =>
          AnthropicProvider.MODELS.find(model => model.id === id) ?? {
            id,
            name: id,
            provider: 'anthropic',
          }
        );
      },
      error => console.error('Failed to fetch Anthropic models:', error),
    );
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
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      // Anthropic API expects system messages separately
      const systemMessages = adaptedMessages.filter(m => m.role === 'system');
      const userMessages = adaptedMessages.filter(m => m.role !== 'system');

      const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': AnthropicProvider.API_VERSION,
        },
        body: JSON.stringify({
          model,
          messages: userMessages,
          system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
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
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
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
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      // Anthropic API expects system messages separately
      const systemMessages = adaptedMessages.filter(m => m.role === 'system');
      const userMessages = adaptedMessages.filter(m => m.role !== 'system');

      const response = await fetch(`${AnthropicProvider.API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': AnthropicProvider.API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: userMessages,
          system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      let fullText = '';
      let tokensIn = 0;
      let tokensOut = 0;
      let returnedModel = model;

      await readSSEStream(response, parsed => {
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
      });

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
    return validateWithApiKey(
      this.apiKey,
      async () => {
        // Make a minimal request to validate the API key
        const response = await this.makeRequest(`${AnthropicProvider.API_BASE}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10,
          }),
        });

        await response.json();
      },
      'API key is required',
      'Invalid API key',
    );
  }
}
