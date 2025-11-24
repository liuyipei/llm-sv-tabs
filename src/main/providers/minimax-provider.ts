/**
 * Minimax provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';

export class MinimaxProvider extends BaseProvider {
  private readonly baseUrl = 'https://api.minimax.chat/v1';

  constructor(apiKey?: string) {
    super('minimax', apiKey);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: false,
      requiresApiKey: true,
      requiresEndpoint: false,
      supportsSystemPrompt: true,
    };
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    return [
      {
        id: 'abab6.5-chat',
        name: 'Abab 6.5 Chat',
        provider: 'minimax',
        contextWindow: 245000,
        supportsVision: false,
      },
      {
        id: 'abab6.5s-chat',
        name: 'Abab 6.5s Chat',
        provider: 'minimax',
        contextWindow: 245000,
        supportsVision: false,
      },
      {
        id: 'abab5.5-chat',
        name: 'Abab 5.5 Chat',
        provider: 'minimax',
        contextWindow: 16384,
        supportsVision: false,
      },
    ];
  }

  /**
   * Convert our internal content format to OpenAI's format
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
        // OpenAI uses image_url with data URL
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
      return { response: '', error: 'API key is required' };
    }

    const model = options?.model || 'abab6.5-chat';
    const startTime = Date.now();

      // Convert messages to OpenAI format
      const openAIMessages = messages.map(msg => ({
        role: msg.role,
        content: this.convertToOpenAIContent(msg.content)
      }));

    try {
      const requestBody = {
        model,
        messages: openAIMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      };

      const url = `${this.baseUrl}/text/chatcompletion_v2`;
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        return { response: '', error: 'No response from Minimax' };
      }

      return {
        response: data.choices[0].message?.content || data.choices[0].text,
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

    const model = options?.model || 'abab6.5-chat';
    const startTime = Date.now();

      // Convert messages to OpenAI format
      const openAIMessages = messages.map(msg => ({
        role: msg.role,
        content: this.convertToOpenAIContent(msg.content)
      }));

    try {
      const requestBody = {
        model,
        messages: openAIMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        stream: true,
      };

      const url = `${this.baseUrl}/text/chatcompletion_v2`;
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
            const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      return {
        response: fullText,
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

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Make a minimal query to validate the API key
      const url = `${this.baseUrl}/text/chatcompletion_v2`;
      await this.makeRequest(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'abab6.5-chat',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
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
