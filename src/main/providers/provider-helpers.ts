import type { LLMModel } from '../../types';

export async function fetchModelsWithFallback(
  apiKey: string | undefined,
  fallback: LLMModel[],
  fetcher: () => Promise<LLMModel[]>,
  onError?: (error: unknown) => void,
): Promise<LLMModel[]> {
  if (!apiKey) {
    return fallback;
  }

  try {
    const models = await fetcher();
    return models.length > 0 ? models : fallback;
  } catch (error) {
    onError?.(error);
    return fallback;
  }
}

export async function validateWithApiKey(
  apiKey: string | undefined,
  request: () => Promise<void>,
  missingKeyMessage: string,
  defaultError: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey) {
    return { valid: false, error: missingKeyMessage };
  }

  try {
    await request();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : defaultError,
    };
  }
}

export async function readSSEStream(
  response: Response,
  onEvent: (parsed: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is not available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

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
        onEvent(JSON.parse(data));
      } catch (e) {
        // Skip malformed JSON
      }
    }
  }
}
