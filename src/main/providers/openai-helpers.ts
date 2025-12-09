import type { MessageContent } from '../../types';

type TokenLimitField = 'max_tokens' | 'max_completion_tokens';

/**
 * Convert our internal content format to OpenAI-compatible format
 */
export function convertToOpenAIContent(content: MessageContent): any {
  if (typeof content === 'string') {
    return content;
  }

  return content.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    } else if (block.type === 'image') {
      const dataUrl = `data:${block.source.media_type};base64,${block.source.data}`;
      return {
        type: 'image_url',
        image_url: { url: dataUrl }
      };
    }
    return block;
  });
}

export function toOpenAIMessages(messages: Array<{ role: string; content: MessageContent }>) {
  return messages.map(msg => ({
    role: msg.role,
    content: convertToOpenAIContent(msg.content)
  }));
}

export function buildOpenAIChatBody(
  messages: Array<{ role: string; content: MessageContent }>,
  model: string,
  maxTokens: number,
  tokenField: TokenLimitField,
  extraBody: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    model,
    messages: toOpenAIMessages(messages),
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
