import type { OpenAIMessage } from './openai-style-mapper.js';
import { parseOpenAIStream } from '../providers/openai-helpers.js';

const DEFAULT_PORTKEY_BASE_URL = process.env.PORTKEY_BASE_URL || 'https://api.portkey.ai/v1';

export interface PortkeyModelMetadata {
  id: string;
  modalities?: string[];
  maxInputTokens?: number;
  maxOutputTokens?: number;
  requiresImagesFirst?: boolean;
  requiresBase64Images?: boolean;
}

export interface PortkeyChatOptions {
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function getPortkeyModelMetadata(
  model: string,
  apiKey?: string
): Promise<PortkeyModelMetadata | null> {
  const key = apiKey || process.env.PORTKEY_API_KEY;
  if (!key) return null;

  try {
    const url = `${DEFAULT_PORTKEY_BASE_URL}/models/${encodeURIComponent(model)}`;
    const metadata = await fetchJson(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
      },
    });

    const modalities: string[] | undefined = metadata.modalities || metadata.capabilities;

    return {
      id: model,
      modalities,
      maxInputTokens: metadata.max_input_tokens ?? metadata.context_length,
      maxOutputTokens: metadata.max_output_tokens,
      requiresImagesFirst: metadata.requires_images_first,
      requiresBase64Images: metadata.requires_base64_images,
    };
  } catch (error) {
    console.warn(`Portkey metadata unavailable for ${model}:`, error);
    return null;
  }
}

export async function portkeyChatCompletions(
  model: string,
  messages: OpenAIMessage[],
  options: PortkeyChatOptions,
  onChunk?: (text: string) => void,
): Promise<{ text: string; tokensIn?: number; tokensOut?: number; model?: string }> {
  const apiKey = options.apiKey || process.env.PORTKEY_API_KEY;
  if (!apiKey) {
    throw new Error('Portkey API key missing. Set PORTKEY_API_KEY or provide apiKey.');
  }

  const url = `${DEFAULT_PORTKEY_BASE_URL}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    stream: !!onChunk,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => response.statusText);
    throw new Error(`Portkey request failed (${response.status}): ${errorBody}`);
  }

  if (onChunk) {
    const { fullText, tokensIn, tokensOut, model: returnedModel } = await parseOpenAIStream(
      response,
      onChunk,
      model
    );
    return { text: fullText, tokensIn, tokensOut, model: returnedModel };
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
    model: data.model,
  };
}
