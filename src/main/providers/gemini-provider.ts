/**
 * Google Gemini provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import { buildCapabilityAwareMessage } from './message-builder.js';
import { fetchModelsWithFallback, readSSEStream, validateWithApiKey } from './provider-helpers.js';

export class GeminiProvider extends BaseProvider {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey?: string) {
    super('gemini', apiKey);
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
    const fallback: LLMModel[] = [
      {
        id: 'gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash (Experimental)',
        provider: 'gemini',
        contextWindow: 1000000,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        contextWindow: 2000000,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'gemini',
        contextWindow: 1000000,
        supportsVision: true,
      },
    ];

    return fetchModelsWithFallback(
      this.apiKey,
      fallback,
      async () => {
        const url = `${this.baseUrl}/models?key=${this.apiKey}`;
        const response = await this.makeRequest(url, { method: 'GET' });
        const data = await response.json();

        if (!Array.isArray(data.models)) {
          return [];
        }

        return data.models.map((model: any) => {
          const id: string = model.name?.split('/').pop() ?? model.name ?? 'unknown-model';
          return {
            id,
            name: model.displayName || id,
            provider: 'gemini',
            contextWindow: model.inputTokenLimit || undefined,
            supportsVision: /flash|pro/i.test(id),
          } as LLMModel;
        });
      },
      error => console.error('Failed to fetch Gemini models:', error),
    );
  }

  private convertToString(content: MessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    // For now, just extract text from content blocks (TODO: support vision)
    return content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('\n');
  }

  async query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { response: '', error: 'API key is required' };
    }

    const model = options?.model || 'gemini-1.5-flash';
    const startTime = Date.now();

    try {
      // Convert messages to Gemini format
      const contents = [];
      let systemInstruction = '';

      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      for (const message of adaptedMessages) {
        if (message.role === 'system') {
          systemInstruction = this.convertToString(message.content);
        } else {
          contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: this.convertToString(message.content) }],
          });
        }
      }

      const requestBody: any = {
        contents,
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 2000,
        },
      };

      // Add system instruction if provided
      if (systemInstruction || options?.systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction || options?.systemPrompt }],
        };
      }

      const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
      const response = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        return { response: '', error: 'No response from Gemini' };
      }

      const candidate = data.candidates[0];
      const content = candidate.content?.parts?.[0]?.text || '';

      return {
        response: content,
        tokensIn: data.usageMetadata?.promptTokenCount,
        tokensOut: data.usageMetadata?.candidatesTokenCount,
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

    const model = options?.model || 'gemini-1.5-flash';
    const startTime = Date.now();

    try {
      // Convert messages to Gemini format
      const contents = [];
      let systemInstruction = '';

      const capabilities = await this.getModelCapabilities(model);
      const adaptedMessages = messages.map((msg) => ({
        role: msg.role,
        content: buildCapabilityAwareMessage(msg.content, capabilities),
      }));

      await this.rateLimitDelay();

      for (const message of adaptedMessages) {
        if (message.role === 'system') {
          systemInstruction = this.convertToString(message.content);
        } else {
          contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: this.convertToString(message.content) }],
          });
        }
      }

      const requestBody: any = {
        contents,
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 2000,
        },
      };

      if (systemInstruction || options?.systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemInstruction || options?.systemPrompt }],
        };
      }

      const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      let fullText = '';
      let tokensIn = 0;
      let tokensOut = 0;

      await readSSEStream(response, parsed => {
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          fullText += text;
          onChunk(text);
        }

        if (parsed.usageMetadata) {
          tokensIn = parsed.usageMetadata.promptTokenCount || tokensIn;
          tokensOut = parsed.usageMetadata.candidatesTokenCount || tokensOut;
        }
      });

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
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    return validateWithApiKey(
      this.apiKey,
      async () => {
        const url = `${this.baseUrl}/models?key=${this.apiKey}`;
        await this.makeRequest(url, { method: 'GET' });
      },
      'API key is required',
      'Invalid API key',
    );
  }
}
