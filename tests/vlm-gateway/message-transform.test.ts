import { describe, it, expect } from 'vitest';
import { transformMessagesForCapabilities } from '../../src/main/vlm-gateway/message-transform';
import type { CanonicalMessage } from '../../src/main/vlm-gateway/types';
import type { ModelCapabilities } from '../../src/main/vlm-gateway/types.internal';

const baseMessage: CanonicalMessage = {
  role: 'user',
  parts: [
    { type: 'text', text: 'Question' },
    { type: 'pdf', source: 'file', uri: '/tmp/sample.pdf' },
    { type: 'image', source: 'url', uri: 'data:image/png;base64,xyz', alt: 'diagram' },
  ],
};

describe('vlm-gateway message transform', () => {
  it('drops image parts for text-only models', () => {
    const caps: ModelCapabilities = {
      supportsText: true,
      supportsVision: false,
      supportsAudioInput: false,
      supportsAudioOutput: false,
      supportsPdfNative: false,
      supportsImageGeneration: false,
    };

    const [message] = transformMessagesForCapabilities([baseMessage], caps, {});

    expect(message.parts.some(p => p.type === 'image')).toBe(false);
    expect(message.parts.some(p => p.type === 'text' && p.text.includes('image omitted'))).toBe(true);
  });

  it('falls back to pdf-as-images text placeholder when vision supported but pdf-native is false', () => {
    const caps: ModelCapabilities = {
      supportsText: true,
      supportsVision: true,
      supportsAudioInput: false,
      supportsAudioOutput: false,
      supportsPdfNative: false,
      supportsImageGeneration: false,
    };

    const [message] = transformMessagesForCapabilities([baseMessage], caps, {});
    const pdfTextParts = message.parts.filter(p => p.type === 'text' && p.text.includes('PDF converted'));

    expect(pdfTextParts.length).toBe(1);
  });
});
