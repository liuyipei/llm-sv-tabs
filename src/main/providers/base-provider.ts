/**
 * Base provider class for LLM integrations
 */

import type { ProviderType, LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import type { ProbedCapabilities } from '../../probe/types';
import { resolveModelCapabilities } from '../services/model-capabilities.js';

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
  supportsSystemPrompt: boolean;
}

export abstract class BaseProvider {
  protected apiKey?: string;
  protected endpoint?: string;
  protected model?: string;
  protected lastRequestTime = 0;

  constructor(
    protected providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  /**
   * Get provider capabilities
   */
  abstract getCapabilities(): ProviderCapabilities;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): Promise<LLMModel[]>;

  /**
   * Send a query to the LLM provider
   */
  abstract query(
    messages: Array<{ role: string; content: MessageContent }>,
    options?: QueryOptions
  ): Promise<LLMResponse>;

  /**
   * Stream a query to the LLM provider
   * @param messages - Array of messages to send (supports multimodal content)
   * @param options - Query options
   * @param onChunk - Callback invoked for each chunk of text
   * @returns Promise that resolves with the complete response
   */
  abstract queryStream(
    messages: Array<{ role: string; content: MessageContent }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse>;

  /**
   * Validate provider configuration
   */
  abstract validate(): Promise<{ valid: boolean; error?: string }>;

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Set endpoint URL
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  /**
   * Set model
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Get provider type
   */
  getType(): ProviderType {
    return this.providerType;
  }

  /**
   * Resolve model capabilities with cache/probing.
   */
  protected async getModelCapabilities(model?: string, forceProbe = false): Promise<ProbedCapabilities> {
    const resolvedModel = model || this.model || '';
    return resolveModelCapabilities(this.providerType, resolvedModel, {
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      forceProbe,
    });
  }

  /**
   * Simple rate-limit delay to avoid rapid bursts.
   */
  protected async rateLimitDelay(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Helper method to make HTTP requests
   */
  protected async makeRequest(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response;
  }
}
