import type { ChatOptions } from './pdf-strategies.js';
import type { ModelSelector } from './models.js';
import { buildOpenAIStyleMessages } from './openai-style-mapper.js';
import { portkeyChatCompletions } from './portkey-client.js';
import type { CanonicalMessage, ChatCompletionResult, ChatResultChunk } from './types.js';
import { canonicalToProviderMessages } from './message-mappers.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { ProviderType } from '../../types.js';

function asProviderType(kind: string): ProviderType | null {
  const mappings: Record<string, ProviderType> = {
    'direct-openai': 'openai',
    'direct-anthropic': 'anthropic',
    'direct-fireworks': 'fireworks',
  };
  return mappings[kind] || null;
}

export async function routeViaPortkey(
  selector: ModelSelector,
  messages: CanonicalMessage[],
  options: ChatOptions,
  onStream?: (chunk: ChatResultChunk) => void
): Promise<ChatCompletionResult> {
  const { openAiMessages } = await buildOpenAIStyleMessages(messages);

  try {
    const response = await portkeyChatCompletions(
      selector.model,
      openAiMessages,
      {
        apiKey: options.portkeyApiKey ?? options.apiKey,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        stream: Boolean(onStream),
      },
      (delta) => onStream?.({ type: 'delta', text: delta })
    );

    if (onStream) {
      onStream({ type: 'final', text: response.text });
    }

    return {
      text: response.text,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      model: response.model ?? selector.model,
    };
  } catch (error) {
    if (onStream) {
      onStream({ type: 'error', errorMessage: error instanceof Error ? error.message : String(error) });
    }

    const fallbackProviderType = selector.provider ?? asProviderType(selector.providerKind);
    if (fallbackProviderType) {
      const provider = ProviderFactory.getProvider(fallbackProviderType, options.apiKey, options.endpoint);
      const providerMessages = await canonicalToProviderMessages(messages);
      const fallbackResponse = await provider.queryStream(providerMessages, {
        provider: fallbackProviderType,
        model: selector.model,
        apiKey: options.apiKey,
        maxTokens: options.maxTokens,
      }, chunk => onStream?.({ type: 'delta', text: chunk }));

      onStream?.({ type: 'final', text: fallbackResponse.response });

      return {
        text: fallbackResponse.response,
        tokensIn: fallbackResponse.tokensIn,
        tokensOut: fallbackResponse.tokensOut,
        model: fallbackResponse.model ?? selector.model,
        error: fallbackResponse.error ?? (error instanceof Error ? error.message : String(error)),
      };
    }

    return {
      text: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
