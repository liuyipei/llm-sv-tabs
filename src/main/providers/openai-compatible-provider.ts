/**
 * Generic OpenAI-compatible provider (for LM Studio, vLLM, etc.)
 */

import { BaseProvider, type ProviderCapabilities } from './base-provider.js';
import type { LLMModel, LLMResponse, QueryOptions, ProviderType, MessageContent } from '../../types';
import { buildOpenAIChatBody, buildOpenAIHeaders, parseOpenAIStream } from './openai-helpers.js';

export interface OpenAICompatibleOptions {
  capabilities?: Partial<ProviderCapabilities>;
  paths?: {
    chatCompletions: string;
    models: string;
  };
  defaultModel?: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider extends BaseProvider {
  private readonly capabilities: ProviderCapabilities;
  private readonly paths: { chatCompletions: string; models: string };
  private readonly defaultModel: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(
    providerType: ProviderType = 'local-openai-compatible',
    endpoint?: string,
    apiKey?: string,
    options?: OpenAICompatibleOptions,
  ) {
    super(providerType, apiKey, endpoint);

    this.capabilities = {
      supportsStreaming: true,
      supportsVision: false,
      requiresApiKey: false,
      requiresEndpoint: true,
      supportsSystemPrompt: true,
      ...options?.capabilities,
    };

    this.paths = options?.paths ?? {
      chatCompletions: '/v1/chat/completions',
      models: '/v1/models',
    };

    this.defaultModel = options?.defaultModel ?? 'default';
    this.extraHeaders = options?.extraHeaders ?? {};
  }

  getCapabilities(): ProviderCapabilities {
    return this.capabilities;
  }

  async getAvailableModels(): Promise<LLMModel[]> {
    if (!this.endpoint) {
      return [];
    }

    try {
      const headers = buildOpenAIHeaders(this.apiKey, this.extraHeaders);

      const response = await this.makeRequest(`${this.endpoint}${this.paths.models}`, {
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

    if (this.capabilities.requiresApiKey && !this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: `API key is required for ${this.providerType}`,
      };
    }

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers = buildOpenAIHeaders(apiKey, this.extraHeaders);

      const response = await this.makeRequest(`${endpoint}${this.paths.chatCompletions}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(messages, model, maxTokens, 'max_tokens'),
        ),
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

    if (this.capabilities.requiresApiKey && !this.apiKey && !options?.apiKey) {
      return {
        response: '',
        error: `API key is required for ${this.providerType}`,
      };
    }

    const endpoint = options?.endpoint || this.endpoint;
    const apiKey = options?.apiKey || this.apiKey;
    const model = options?.model || this.model || this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;

    try {
      const headers = buildOpenAIHeaders(apiKey, this.extraHeaders, true);

      const response = await fetch(`${endpoint}${this.paths.chatCompletions}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildOpenAIChatBody(messages, model, maxTokens, 'max_tokens', {
            stream: true,
            stream_options: { include_usage: true },
          }),
        ),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const { fullText, tokensIn, tokensOut, model: returnedModel } = await parseOpenAIStream(
        response,
        onChunk,
        model
      );

      return {
        response: fullText,
        tokensIn,
        tokensOut,
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
      const headers = buildOpenAIHeaders(this.apiKey, this.extraHeaders);

      const response = await this.makeRequest(`${this.endpoint}${this.paths.models}`, {
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
