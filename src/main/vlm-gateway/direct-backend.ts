import type { ProviderType, QueryOptions } from '../../types.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { ChatOptions } from './pdf-strategies.js';
import type { ModelSelector } from './models.js';
import { canonicalToProviderMessages } from './message-mappers.js';
import type { CanonicalMessage, ChatResultChunk, ChatCompletionResult } from './types.js';

function buildQueryOptions(
  provider: ProviderType,
  model: string,
  options: ChatOptions
): QueryOptions {
  return {
    provider,
    model,
    apiKey: options.apiKey,
    endpoint: options.endpoint,
    maxTokens: options.maxTokens,
  };
}

export async function routeDirect(
  selector: ModelSelector,
  messages: CanonicalMessage[],
  options: ChatOptions,
  onStream?: (chunk: ChatResultChunk) => void
): Promise<ChatCompletionResult> {
  if (!selector.provider) {
    throw new Error('Provider is required for direct routing');
  }

  const provider = ProviderFactory.getProvider(selector.provider, options.apiKey, options.endpoint);
  const providerMessages = await canonicalToProviderMessages(messages);
  const queryOptions = buildQueryOptions(selector.provider, selector.model, options);

  const response = await provider.queryStream(providerMessages, queryOptions, (chunk) => {
    if (chunk && onStream) {
      onStream({ type: 'delta', text: chunk });
    }
  });

  if (onStream) {
    if (response.error) {
      onStream({ type: 'error', errorMessage: response.error, raw: response });
    }
    onStream({ type: 'final', text: response.response, raw: response });
  }

  return {
    text: response.response,
    tokensIn: response.tokensIn,
    tokensOut: response.tokensOut,
    model: response.model,
    error: response.error,
  };
}
