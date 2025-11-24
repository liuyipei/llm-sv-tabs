/**
 * Google Gemini provider implementation
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';

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
    return [
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

      for (const message of messages) {
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
          temperature: options?.temperature ?? 0.7,
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

      for (const message of messages) {
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
          temperature: options?.temperature ?? 0.7,
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
          if (!line.trim() || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              fullText += text;
              onChunk(text);
            }

            if (parsed.usageMetadata) {
              tokensIn = parsed.usageMetadata.promptTokenCount || tokensIn;
              tokensOut = parsed.usageMetadata.candidatesTokenCount || tokensOut;
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
      };
    }
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.apiKey) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      await this.makeRequest(url, { method: 'GET' });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
