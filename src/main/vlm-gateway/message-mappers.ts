import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { ContentBlock, MessageContent } from '../../types.js';
import type { CanonicalMessage, CanonicalPart } from './types.js';

function dataUrlToBase64(uri: string): { data: string; mimeType: string } | null {
  const match = uri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function fileToBase64(uri: string): Promise<{ data: string; mimeType: string }> {
  const buffer = await readFile(uri);
  const data = buffer.toString('base64');
  const ext = extname(uri).toLowerCase();
  const mimeType = ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';

  return { data, mimeType };
}

async function canonicalPartToBlocks(part: CanonicalPart): Promise<ContentBlock[]> {
  if (part.type === 'text') {
    return [{ type: 'text', text: part.text }];
  }

  if (part.type === 'image') {
    const parsed = part.source === 'url' ? dataUrlToBase64(part.uri) : null;
    const fileData = part.source === 'file' ? await fileToBase64(part.uri.replace('file://', '')) : null;
    const payload = parsed ?? fileData;

    if (payload) {
      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: payload.mimeType,
            data: payload.data,
          },
        },
      ];
    }

    return [{ type: 'text', text: part.alt ? `[image: ${part.alt}]` : '[image]' }];
  }

  if (part.type === 'pdf') {
    return [{ type: 'text', text: `[pdf attached: ${part.uri}]` }];
  }

  return [{ type: 'text', text: `[${part.type} content not supported]` }];
}

export async function canonicalToProviderMessages(
  messages: CanonicalMessage[]
): Promise<Array<{ role: string; content: MessageContent }>> {
  const converted = [];

  for (const message of messages) {
    const blocks: ContentBlock[] = [];

    for (const part of message.parts) {
      const newBlocks = await canonicalPartToBlocks(part);
      blocks.push(...newBlocks);
    }

    const content: MessageContent = blocks.length === 1 && blocks[0].type === 'text'
      ? blocks[0].text
      : blocks;

    converted.push({
      role: message.role,
      content,
    });
  }

  return converted;
}
