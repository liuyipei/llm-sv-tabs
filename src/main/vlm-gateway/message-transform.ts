import type { CanonicalMessage } from './types.js';
import type { ModelCapabilities } from './types.internal.js';
import type { ChatOptions } from './pdf-strategies.js';
import { defaultPdfStrategyFor, resolvePdfPartsForModel } from './pdf-strategies.js';

export function transformMessagesForCapabilities(
  messages: CanonicalMessage[],
  caps: ModelCapabilities,
  options: ChatOptions
): CanonicalMessage[] {
  const pdfStrategy = options.pdfStrategy ?? defaultPdfStrategyFor(caps);

  return messages.map(message => {
    const parts = message.parts.flatMap((part) => {
      if (part.type === 'image' && !caps.supportsVision) {
        return {
          type: 'text',
          text: part.alt ? `[image omitted: ${part.alt}]` : '[image omitted]',
        } as const;
      }

      if (part.type === 'pdf') {
        return resolvePdfPartsForModel([part], caps, pdfStrategy);
      }

      return part;
    });

    return {
      ...message,
      parts,
    };
  });
}
