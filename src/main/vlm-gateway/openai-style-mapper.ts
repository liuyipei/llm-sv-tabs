import { readFile } from 'fs/promises';
import type { CanonicalMessage, CanonicalPart } from './types.js';

interface OpenAIImagePart {
  type: 'image_url';
  image_url: { url: string };
}

interface OpenAITextPart {
  type: 'text';
  text: string;
}

type OpenAIContentPart = OpenAIImagePart | OpenAITextPart;

export interface OpenAIMessage {
  role: string;
  content: Array<OpenAIContentPart> | string;
}

function toDataUrlFromBase64(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`;
}

async function canonicalToOpenAIParts(part: CanonicalPart): Promise<OpenAIContentPart[]> {
  if (part.type === 'text') {
    return [{ type: 'text', text: part.text }];
  }

  if (part.type === 'image') {
    if (part.source === 'url' && part.uri.startsWith('data:')) {
      return [{ type: 'image_url', image_url: { url: part.uri } }];
    }

    if (part.source === 'file') {
      const filePath = part.uri.replace('file://', '');
      const buffer = await readFile(filePath);
      const data = buffer.toString('base64');
      const url = toDataUrlFromBase64('image/png', data);
      return [{ type: 'image_url', image_url: { url } }];
    }

    return [{ type: 'text', text: part.alt ? `[image: ${part.alt}]` : '[image]' }];
  }

  if (part.type === 'pdf') {
    return [{ type: 'text', text: `[pdf attached: ${part.uri}]` }];
  }

  return [{ type: 'text', text: `[${part.type} not supported]` }];
}

export async function buildOpenAIStyleMessages(
  messages: CanonicalMessage[]
): Promise<{ openAiMessages: OpenAIMessage[] }> {
  const converted: OpenAIMessage[] = [];

  for (const message of messages) {
    const contentParts: OpenAIContentPart[] = [];
    for (const part of message.parts) {
      const openaiParts = await canonicalToOpenAIParts(part);
      contentParts.push(...openaiParts);
    }

    const content = contentParts.length === 1 && contentParts[0].type === 'text'
      ? contentParts[0].text
      : contentParts;

    converted.push({
      role: message.role,
      content,
    });
  }

  return { openAiMessages: converted };
}
