/**
 * Base provider class for LLM integrations
 */

import type { ProviderType, LLMModel, LLMResponse, QueryOptions, MessageContent } from '../../types';
import type { ProbedCapabilities } from '../../probe/types';
import { resolveModelCapabilities } from '../services/model-capabilities.js';
import { TokenBucket } from '../utils/token-bucket.js';

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

  // Token bucket for rate limiting: 10 requests capacity, refills at 2 per second
  // This allows bursts of up to 10 requests, then throttles to 2 requests/second
  private rateLimitBucket: TokenBucket;

  constructor(
    protected providerType: ProviderType,
    apiKey?: string,
    endpoint?: string
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;

    // Initialize rate limiting with token bucket
    // Default: 10 tokens capacity, 2 tokens per second refill rate
    this.rateLimitBucket = new TokenBucket(10, 2);
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
   * @param signal - Optional AbortSignal to cancel the stream
   * @returns Promise that resolves with the complete response
   */
  abstract queryStream(
    messages: Array<{ role: string; content: MessageContent }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
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
   * Rate-limit delay using token bucket algorithm.
   * This provides more sophisticated rate limiting that allows bursts
   * while maintaining an average rate limit.
   */
  protected async rateLimitDelay(): Promise<void> {
    await this.rateLimitBucket.consume(1);
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
