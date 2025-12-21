/**
 * Anthropic (Claude) provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import { fetchModelsWithFallback, readSSEStream, validateWithApiKey } from './provider-helpers.js';
import {
  hasImageContent,
  prepareMessagesWithVisionCheck,
  type ModelVisionInfo,
} from './vision-capability-probe.js';

/**
 * Strip image content from Anthropic-format messages
 */
function stripAnthropicImages(
  messages: Array<{ role: string; content: MessageContent }>
): Array<{ role: string; content: MessageContent }> {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return msg;
    }

    if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(block => block.type === 'text');
      // If only text parts remain, simplify to string if single part
      if (textParts.length === 1) {
        return { role: msg.role, content: (textParts[0] as { type: 'text'; text: string }).text };
      }
      return { role: msg.role, content: textParts };
    }

    return msg;
  });
}

export class AnthropicProvider extends BaseProvider {
  private static readonly API_BASE = 'https://api.anthropic.com/v1';
  // Anthropic requires a fixed version header for their API; this is the latest for the messages endpoint.
  private static readonly API_VERSION = '2023-06-01';
  private static readonly MODELS: LLMModel[] = [
    // Claude 4 family (2025)
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    // Claude 3.5 family - Haiku vision added Feb 2025
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, supportsVision: true },
    // Claude 3 family (legacy)
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

    // Check vision support and prepare messages
    const hasImages = hasImageContent(messages as Array<{ role: string; content: unknown }>);
    const { messages: preparedMessages, imagesStripped, warning } = prepareMessagesWithVisionCheck(
      messages,
      model,
      AnthropicProvider.MODELS as ModelVisionInfo[],
      hasImages,
      stripAnthropicImages
    );

    try {
      // Anthropic API expects system messages separately
      const systemMessages = preparedMessages.filter(m => m.role === 'system');
      const userMessages = preparedMessages.filter(m => m.role !== 'system');

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

      let responseText = data.content[0]?.text || '';

      // Prepend warning if images were stripped
      if (imagesStripped && warning) {
        responseText = `[Note: ${warning}]\n\n${responseText}`;
      }

      return {
        response: responseText,
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
    const maxTokens = options?.maxTokens ?? 4096;

    // Check vision support and prepare messages
    const hasImages = hasImageContent(messages as Array<{ role: string; content: unknown }>);
    const { messages: preparedMessages, imagesStripped, warning } = prepareMessagesWithVisionCheck(
      messages,
      model,
      AnthropicProvider.MODELS as ModelVisionInfo[],
      hasImages,
      stripAnthropicImages
    );

    // Emit warning first if images were stripped
    if (imagesStripped && warning) {
      onChunk(`[Note: ${warning}]\n\n`);
    }

    try {
      // Anthropic API expects system messages separately
      const systemMessages = preparedMessages.filter(m => m.role === 'system');
      const userMessages = preparedMessages.filter(m => m.role !== 'system');

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

      // Include warning in final response text
      const responseText = imagesStripped && warning
        ? `[Note: ${warning}]\n\n${fullText}`
        : fullText;

      return {
        response: responseText,
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
