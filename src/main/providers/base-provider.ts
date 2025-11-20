/**
 * Base provider class for LLM integrations
 */

import type { ProviderType, LLMModel, LLMResponse, QueryOptions } from '../../types';

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
    messages: Array<{ role: string; content: string }>,
    options?: QueryOptions
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
