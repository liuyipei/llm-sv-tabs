import type { ChatOptions } from './pdf-strategies.js';
import { transformMessagesForCapabilities } from './message-transform.js';
import { getModelCapabilities } from './capabilities.js';
import type { ModelSelector } from './models.js';
import { routeViaPortkey } from './portkey-backend.js';
import { routeDirect } from './direct-backend.js';
import type { Conversation, ChatResultChunk, ChatCompletionResult } from './types.js';
import type { ModelCapabilities } from './types.internal.js';

export async function chat(
  selector: ModelSelector,
  conversation: Conversation,
  options: ChatOptions,
  onStream?: (chunk: ChatResultChunk) => void,
  resolvedCapabilities?: ModelCapabilities
): Promise<ChatCompletionResult> {
  const capabilities = resolvedCapabilities
    ?? await getModelCapabilities(selector, options.portkeyApiKey ?? options.apiKey);
  const transformedMessages = transformMessagesForCapabilities(
    conversation.messages,
    capabilities,
    options
  );

  if (selector.providerKind === 'portkey') {
    return routeViaPortkey(selector, transformedMessages, options, onStream);
  }

  return routeDirect(selector, transformedMessages, options, onStream);
}
