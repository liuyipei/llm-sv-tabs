/**
 * Fireworks AI provider implementation (Serverless)
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';

export class FireworksProvider extends BaseProvider {
  private readonly baseUrl = 'https://api.fireworks.ai/inference/v1';

  constructor(apiKey?: string) {
    super('fireworks', apiKey);
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
    if (!this.apiKey) {
      console.warn('Fireworks API key not set, returning empty model list');
      return [];
    }

    try {
      const url = `${this.baseUrl}/models`;
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const data = (await response.json()) as { data?: Array<{ id: string }> };

      // Map to LLMModel format
      return (data.data || []).map((model) => ({
        id: model.id,
        name: model.id.split('/').pop() || model.id,
        provider: 'fireworks' as const,
      }));
    } catch (error) {
      console.error('Failed to fetch Fireworks models:', error);
      return [];
    }
  }

  /**
   * Convert our internal content format to OpenAI-compatible format (Fireworks uses OpenAI API)
   */
  private convertToOpenAIContent(content: MessageContent): any {
    if (typeof content === 'string') {
      return content;
    }

    // Convert ContentBlock[] to OpenAI format
    return content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      } else if (block.type === 'image') {
        // Fireworks uses OpenAI's image_url format
        const dataUrl = `data:${block.source.media_type};base64,${block.source.data}`;
        return {
          type: 'image_url',
          image_url: { url: dataUrl }
        };
      }
      return block;
    });
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required for Fireworks' };
    }

    const model = options?.model || 'accounts/fireworks/models/deepseek-v3p1';
    const startTime = Date.now();

    try {
      // Convert messages to OpenAI format
      const openAIMessages = messages.map(msg => ({
        role: msg.role,
        content: this.convertToOpenAIContent(msg.content)
      }));

      const requestBody = {
        model,
        messages: openAIMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
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
        return { response: '', error: 'No response from Fireworks' };
      }

      return {
        response: data.choices[0].message.content,
        tokensIn: data.usage?.prompt_tokens,
        tokensOut: data.usage?.completion_tokens,
        responseTime: Date.now() - startTime,
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
    if (!this.apiKey) {
      return { response: '', error: 'API key is required for Fireworks' };
    }

    const model = options?.model || 'accounts/fireworks/models/deepseek-v3p1';
    const startTime = Date.now();

    try {
      // Convert messages to OpenAI format
      const openAIMessages = messages.map(msg => ({
        role: msg.role,
        content: this.convertToOpenAIContent(msg.content)
      }));

      const requestBody = {
        model,
        messages: openAIMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
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
        responseTime: Date.now() - startTime,
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Try to fetch models to validate the API key
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
