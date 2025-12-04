import { describe, it, expect } from 'vitest';
import { normalizeWhitespace } from '../../src/main/utils/text-normalizer';

describe('normalizeWhitespace', () => {
  it('should trim lines and remove excessive whitespace', () => {
    const input = `
Android

          Stay organized with Android 16


    `;
    const result = normalizeWhitespace(input);
    expect(result).toBe('Android\n\nStay organized with Android 16');
  });

  it('should collapse multiple empty lines into single empty line', () => {
    const input = 'Line 1\n\n\n\nLine 2';
    const result = normalizeWhitespace(input);
    expect(result).toBe('Line 1\n\nLine 2');
  });

  it('should remove trailing empty lines', () => {
    const input = 'Content\n\n\n';
    const result = normalizeWhitespace(input);
    expect(result).toBe('Content');
  });

  it('should handle empty string', () => {
    expect(normalizeWhitespace('')).toBe('');
  });

  it('should preserve paragraph breaks', () => {
    const input = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
    const result = normalizeWhitespace(input);
    expect(result).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
  });
});
