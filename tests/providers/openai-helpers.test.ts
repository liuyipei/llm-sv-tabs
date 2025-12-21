import { describe, it, expect, vi } from 'vitest';
import { convertToOpenAIContent, parseOpenAIStream } from '../../src/main/providers/openai-helpers.js';
import type { MessageContent } from '../../src/types';

const encoder = new TextEncoder();

describe('convertToOpenAIContent', () => {
  it('returns strings unchanged', () => {
    const text: MessageContent = 'hello world';
    expect(convertToOpenAIContent(text)).toBe('hello world');
  });

  it('converts structured content blocks with images first', () => {
    const content: MessageContent = [
      { type: 'text', text: 'hello' },
      { type: 'image', source: { media_type: 'image/png', data: 'abcd' } },
    ];

    const result = convertToOpenAIContent(content);

    // Images are placed before text for Llama 4, Qwen3-VL compatibility
    expect(result).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abcd' } },
      { type: 'text', text: 'hello' },
    ]);
  });

  it('respects text_first ordering when specified', () => {
    const content: MessageContent = [
      { type: 'text', text: 'hello' },
      { type: 'image', source: { media_type: 'image/png', data: 'abcd' } },
    ];

    const result = convertToOpenAIContent(content, 'text_first');

    expect(result).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abcd' } },
    ]);
  });
});

describe('parseOpenAIStream', () => {
  it('aggregates streamed deltas and usage data', async () => {
    const chunks = [
      ': ping\n',
      'data: {"choices":[{"delta":{"content":"Hello"}}],"model":"gpt-test"}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const response = { body: stream } as unknown as Response;
    const onChunk = vi.fn();

    const result = await parseOpenAIStream(response, onChunk, 'initial-model');

    expect(onChunk).toHaveBeenCalledWith('Hello');
    expect(onChunk).toHaveBeenCalledWith(' world');
    expect(result.fullText).toBe('Hello world');
    expect(result.tokensIn).toBe(5);
    expect(result.tokensOut).toBe(2);
    expect(result.model).toBe('gpt-test');
  });
});
