import type { MessageContent } from '../../types';
import type { ProbedCapabilities } from '../../probe/types';

function ensureBase64Image(part: any): any {
  if (part.type !== 'image') return part;

  if (part.source?.type === 'base64') return part;

  const dataUrl: string | undefined = part.source?.image_url?.url || part.source?.url;
  if (!dataUrl) return part;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return part;

  const [, media_type, data] = match;
  return {
    ...part,
    source: { type: 'base64', media_type, data },
  };
}

function moveImagesFirst(parts: any[]): any[] {
  const images = parts.filter((p) => p.type === 'image');
  const others = parts.filter((p) => p.type !== 'image');
  return [...images, ...others];
}

function renderPdfAsImages(part: any): any[] {
  if (part.type !== 'document' || !part.pages) return [part];
  return part.pages.map((page: any) => ({
    type: 'image',
    source: page,
  }));
}

function extractPdfText(part: any): any[] {
  if (part.type !== 'document' || !part.text) return [part];
  return [{ type: 'text', text: part.text }];
}

export function buildCapabilityAwareMessage(
  content: MessageContent,
  capabilities: ProbedCapabilities
): MessageContent {
  if (typeof content === 'string') return content;

  let parts = [...(content as any[])];

  const hasImages = parts.some((p) => p.type === 'image');
  if (hasImages && !capabilities.supportsVision) {
    parts = parts.filter((p) => p.type !== 'image');
  } else if (hasImages) {
    if (capabilities.requiresBase64Images) {
      parts = parts.map((p) => (p.type === 'image' ? ensureBase64Image(p) : p));
    }
    if (capabilities.requiresImagesFirst) {
      parts = moveImagesFirst(parts);
    }
  }

  const hasPdf = parts.some((p) => p.type === 'document');
  if (hasPdf) {
    if (capabilities.supportsPdfNative) {
      // keep as-is
    } else if (capabilities.supportsPdfAsImages) {
      parts = parts.flatMap((p) => (p.type === 'document' ? renderPdfAsImages(p) : [p]));
    } else {
      parts = parts.flatMap((p) => (p.type === 'document' ? extractPdfText(p) : [p]));
    }
  }

  return parts;
}
