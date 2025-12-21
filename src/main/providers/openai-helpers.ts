import type { MessageContent } from '../../types';
import type { ContentOrdering } from './model-capabilities.js';

type TokenLimitField = 'max_tokens' | 'max_completion_tokens';

/**
 * Convert our internal content format to OpenAI-compatible format.
 *
 * Content ordering can be specified per-model:
 * - 'images_first': Images before text (required by Llama 4, Qwen3-VL)
 * - 'text_first': Text before images
 * - 'any': Preserve original order (default for most models)
 *
 * @param content - The message content to convert
 * @param ordering - Content ordering preference (default: 'images_first' for safety)
 */
export function convertToOpenAIContent(
  content: MessageContent,
  ordering: ContentOrdering = 'images_first'
): any {
  if (typeof content === 'string') {
    return content;
  }

  // Separate images and text
  const imageParts: any[] = [];
  const textParts: any[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      textParts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image') {
      const dataUrl = `data:${block.source.media_type};base64,${block.source.data}`;
      imageParts.push({
        type: 'image_url',
        image_url: { url: dataUrl }
      });
    } else {
      // Unknown block type, preserve as-is in text section
      textParts.push(block);
    }
  }

  // Apply ordering based on model requirements
  switch (ordering) {
    case 'images_first':
      return [...imageParts, ...textParts];
    case 'text_first':
      return [...textParts, ...imageParts];
    case 'any':
    default:
      // Preserve original order by interleaving based on source positions
      // For safety, default to images_first since more models require it
      return [...imageParts, ...textParts];
  }
}

export function toOpenAIMessages(
  messages: Array<{ role: string; content: MessageContent }>,
  ordering: ContentOrdering = 'images_first'
) {
  return messages.map(msg => ({
    role: msg.role,
    content: convertToOpenAIContent(msg.content, ordering)
  }));
}

export function buildOpenAIChatBody(
  messages: Array<{ role: string; content: MessageContent }>,
  model: string,
  maxTokens: number,
  tokenField: TokenLimitField,
  extraBody: Record<string, unknown> = {},
  ordering: ContentOrdering = 'images_first'
): Record<string, unknown> {
  return {
    model,
    messages: toOpenAIMessages(messages, ordering),
    [tokenField]: maxTokens,
    ...extraBody,
  };
}

export function buildOpenAIHeaders(
  apiKey?: string,
  extraHeaders: Record<string, string> = {},
  includeContentType = false,
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

/**
 * Parse an OpenAI-style streaming response and emit deltas.
 */
export async function parseOpenAIStream(
  response: Response,
  onChunk: (chunk: string) => void,
  initialModel: string
): Promise<{ fullText: string; tokensIn: number; tokensOut: number; model: string }>
{
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is not available');
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let returnedModel = initialModel;
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
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
        if (parsed.model) {
          returnedModel = parsed.model;
        }
        if (parsed.usage) {
          tokensIn = parsed.usage.prompt_tokens || 0;
          tokensOut = parsed.usage.completion_tokens || 0;
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }
  }

  return { fullText, tokensIn, tokensOut, model: returnedModel };
}
