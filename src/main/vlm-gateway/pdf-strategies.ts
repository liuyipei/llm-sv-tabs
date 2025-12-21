import type { CanonicalPart } from './types.js';
import type { ModelCapabilities } from './types.internal.js';

export type PdfStrategy = 'pdf-native' | 'pdf-as-images' | 'pdf-hybrid';

export interface ChatOptions {
  pdfStrategy?: PdfStrategy;
  pageSelection?: number[];
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  endpoint?: string;
  portkeyApiKey?: string;
}

type PdfPart = Extract<CanonicalPart, { type: 'pdf' }>;

export function defaultPdfStrategyFor(caps: ModelCapabilities): PdfStrategy {
  if (caps.supportsPdfNative) return 'pdf-native';
  if (caps.supportsVision) return 'pdf-as-images';
  return 'pdf-hybrid';
}

function extractPdfTextAsPart(part: PdfPart): CanonicalPart {
  return {
    type: 'text',
    text: `PDF content available at ${part.uri}`,
  } as CanonicalPart;
}

function rasterizePdfToImageParts(part: PdfPart): CanonicalPart[] {
  return [
    {
      type: 'text',
      text: `PDF converted to images from ${part.uri}`,
    } as CanonicalPart,
  ];
}

export function resolvePdfPartsForModel(
  parts: CanonicalPart[],
  caps: ModelCapabilities,
  strategy: PdfStrategy
): CanonicalPart[] {
  return parts.flatMap(part => {
    if (part.type !== 'pdf') return [part];

    const pdfPart: PdfPart = part;

    switch (strategy) {
      case 'pdf-native':
        if (caps.supportsPdfNative) return [pdfPart];
        return [extractPdfTextAsPart(pdfPart)];
      case 'pdf-hybrid':
        if (caps.supportsText && caps.supportsVision) {
          return rasterizePdfToImageParts(pdfPart);
        }
        return [extractPdfTextAsPart(pdfPart)];
      case 'pdf-as-images':
      default:
        if (caps.supportsVision) return rasterizePdfToImageParts(pdfPart);
        return [extractPdfTextAsPart(pdfPart)];
    }
  });
}
