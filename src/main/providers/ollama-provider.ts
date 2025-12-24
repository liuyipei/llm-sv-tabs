/**
 * Ollama provider implementation (local models)
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import { convertToOpenAIContent } from './openai-helpers.js';
import { buildCapabilityAwareMessage } from './message-builder.js';

export class OllamaProvider extends BaseProvider {
  private static readonly DEFAULT_ENDPOINT = 'http://localhost:11434';

  constructor(endpoint?: string) {
    super('ollama', undefined, endpoint || OllamaProvider.DEFAULT_ENDPOINT);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsVision: true, // Some Ollama models support vision
      requiresApiKey: false,
      requiresEndpoint: true,
      supportsSystemPrompt: true,
    };
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    try {
      const response = await this.makeRequest(`${this.endpoint}/api/tags`, {
        method: 'GET',
      });

      const data = await response.json() as { models?: Array<{ name: string; details?: any }> };

      return (data.models || []).map(model => ({
        id: model.name,
        name: model.name,
        provider: 'ollama' as const,
        contextWindow: model.details?.parameter_size || undefined,
        supportsVision: model.name.includes('vision') || model.name.includes('llava'),
      }));
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      // Return some default models if the API call fails
      return [
        { id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', supportsVision: false },
        { id: 'mistral', name: 'Mistral', provider: 'ollama', supportsVision: false },
        { id: 'codellama', name: 'Code Llama', provider: 'ollama', supportsVision: false },
      ];
    }
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    const endpoint = options?.endpoint || this.endpoint || OllamaProvider.DEFAULT_ENDPOINT;
    const model = options?.model || this.model || 'llama3.2';

    try {
      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      // Convert messages to OpenAI format
      const openAIMessages = adaptedMessages.map(msg => ({
        role: msg.role,
        content: convertToOpenAIContent(msg.content)
      }));

      const response = await this.makeRequest(`${endpoint}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages: openAIMessages,
          stream: false,
          options: {},
        }),
      });

      const data = await response.json() as any;
      const responseTime = Date.now() - startTime;

      return {
        response: data.message?.content || '',
        tokensIn: data.prompt_eval_count,
        tokensOut: data.eval_count,
        responseTime,
        model,
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

    const endpoint = options?.endpoint || this.endpoint || OllamaProvider.DEFAULT_ENDPOINT;
    const model = options?.model || this.model || 'llama3.2';

    try {
      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      // Convert messages to OpenAI format
      const openAIMessages = adaptedMessages.map(msg => ({
        role: msg.role,
        content: convertToOpenAIContent(msg.content)
      }));

      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: openAIMessages,
          stream: true,
          options: {},
        }),
        signal,
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line);
            const content = parsed.message?.content || '';
            if (content) {
              fullText += content;
              onChunk(content);
            }

            // Ollama returns token counts in the final message
            if (parsed.done) {
              tokensIn = parsed.prompt_eval_count || tokensIn;
              tokensOut = parsed.eval_count || tokensOut;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      return {
        response: fullText,
        tokensIn,
        tokensOut,
        responseTime: Date.now() - startTime,
        model,
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
    try {
      const response = await this.makeRequest(`${this.endpoint}/api/tags`, {
        method: 'GET',
      });

      await response.json();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Ollama',
      };
    }
  }
}
