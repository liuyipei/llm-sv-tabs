import { describe, it, expect } from 'vitest';
import {
  assessQuality,
  describeQuality,
  isQualitySufficientForText,
} from '../../src/main/services/context/quality-hints';

describe('quality-hints', () => {
  describe('assessQuality', () => {
    describe('good quality', () => {
      it('should classify clean text as good', () => {
        const text = `This is a well-formatted paragraph with proper sentences. It contains multiple lines of clean, readable text. The average line length is reasonable and consistent. This paragraph has enough content to properly assess the quality of the text extraction.`;

        expect(assessQuality(text)).toBe('good');
      });

      it('should classify article text as good', () => {
        const text = `Introduction to Machine Learning: Machine learning is a subset of artificial intelligence that focuses on building systems that can learn from data. These systems improve their performance over time without being explicitly programmed for each task. There are three main types of machine learning: supervised learning, unsupervised learning, and reinforcement learning. Each approach has its own strengths and use cases.`;

        expect(assessQuality(text)).toBe('good');
      });

      it('should classify typical web content as good', () => {
        const text = `Welcome to our documentation portal. This guide will help you get started with our product. First, you need to install the software by downloading it from our website. Then, follow the installation wizard to complete the setup. After installation, you can configure the settings according to your preferences.`;

        expect(assessQuality(text)).toBe('good');
      });
    });

    describe('mixed quality', () => {
      it('should classify text with moderate non-ASCII as mixed', () => {
        // Between 5-20% non-ASCII characters (above 20% is "low")
        // Need more non-ASCII chars to exceed 5% threshold
        const text = `Bonjour café résumé naïve über señor møre æther œuvre façade fiancée déjà vu exposé protégé mêlée crème brûlée entrée and some English text to fill it out a bit more.`;

        expect(assessQuality(text)).toBe('mixed');
      });

      it('should classify text with repeated sequences as potentially mixed or good', () => {
        const text = `Normal text here........ and then some more content======= with strange repeated characters######## that might indicate extraction issues. This happens more........ often than expected.`;

        const quality = assessQuality(text);
        expect(['good', 'mixed']).toContain(quality);
      });
    });

    describe('low quality', () => {
      it('should classify empty text as low', () => {
        expect(assessQuality('')).toBe('low');
        expect(assessQuality('   ')).toBe('low');
        expect(assessQuality('\n\n\n')).toBe('low');
      });

      it('should classify mostly whitespace content as low', () => {
        // More than 70% whitespace (sparse content)
        const text = '    a          b             c                d                 e                  ';
        expect(assessQuality(text)).toBe('low');
      });

      it('should classify text with many control characters as low', () => {
        const text = 'Normal text\x00\x01\x02\x03\x04\x05\x06\x07more text\x08\x0B\x0C';

        expect(assessQuality(text)).toBe('low');
      });

      it('should classify very short average word length as low', () => {
        // Average word length < 2.5 with more than 10 words
        const text = 'aa bb cc dd ee ff gg hh jj kk ll mm nn oo pp qq rr ss tt';

        expect(assessQuality(text)).toBe('low');
      });
    });

    describe('ocr_like quality', () => {
      it('should classify text with very many single-char words as ocr_like', () => {
        // Very high single-char word ratio (>25%) with many words (>20)
        const words: string[] = [];
        for (let i = 0; i < 30; i++) {
          words.push('x'); // single char
          words.push('y'); // single char
          words.push('normal'); // normal word
        }
        const text = words.join(' ');

        const quality = assessQuality(text);
        // With 60 single-char words and 30 normal words (66% single-char ratio)
        // this should trigger OCR-like detection
        expect(quality).toBe('ocr_like');
      });

      it('should classify deliberately broken OCR text appropriately', () => {
        // Extremely broken OCR-like text - every character is separated
        const text = `T h e s o f t w a r e m u s t b e i n s t a l l e d o n a l o c a l d r i v e. P l e a s e e n t e r t h e l i c e n s e k e y. C o n t a c t s u p p o r t f o r a s s i s t a n c e.`;

        const quality = assessQuality(text);
        // This has extremely high single-char word ratio
        expect(['ocr_like', 'low']).toContain(quality);
      });

      it('should classify text with common OCR errors as good or mixed when pattern count is low', () => {
        // A few OCR patterns but not enough to trigger OCR detection
        const text = `The licensed software must be installed on a local drive.
          Please enter the license key: ABCD-1234-EFGH-5678.
          Contact support at support@example.com for assistance.`;

        const quality = assessQuality(text);
        // Should not be classified as OCR-like because patterns are limited
        expect(['good', 'mixed']).toContain(quality);
      });
    });
  });

  describe('describeQuality', () => {
    it('should describe good quality', () => {
      const description = describeQuality('good');
      expect(description).toContain('Good quality');
    });

    it('should describe mixed quality', () => {
      const description = describeQuality('mixed');
      expect(description).toContain('Mixed quality');
    });

    it('should describe low quality', () => {
      const description = describeQuality('low');
      expect(description).toContain('Low quality');
    });

    it('should describe ocr_like quality', () => {
      const description = describeQuality('ocr_like');
      expect(description).toContain('OCR');
    });
  });

  describe('isQualitySufficientForText', () => {
    it('should return true for good quality', () => {
      expect(isQualitySufficientForText('good')).toBe(true);
    });

    it('should return true for mixed quality', () => {
      expect(isQualitySufficientForText('mixed')).toBe(true);
    });

    it('should return false for low quality', () => {
      expect(isQualitySufficientForText('low')).toBe(false);
    });

    it('should return false for ocr_like quality', () => {
      expect(isQualitySufficientForText('ocr_like')).toBe(false);
    });
  });
});
