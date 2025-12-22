/**
 * Tests for probe fixtures
 */

import { describe, it, expect } from 'vitest';
import {
  TINY_PNG_BASE64,
  TINY_PNG_MIME_TYPE,
  TINY_PDF_BASE64,
  TINY_PDF_MIME_TYPE,
  getTinyPngDataUrl,
  getTinyPdfDataUrl,
  PROBE_PROMPTS,
  getFixtureStats,
} from '../../src/probe/fixtures';

describe('fixtures', () => {
  describe('TINY_PNG', () => {
    it('should be valid base64', () => {
      expect(() => Buffer.from(TINY_PNG_BASE64, 'base64')).not.toThrow();
    });

    it('should have correct MIME type', () => {
      expect(TINY_PNG_MIME_TYPE).toBe('image/png');
    });

    it('should be a valid PNG (check magic bytes)', () => {
      const buffer = Buffer.from(TINY_PNG_BASE64, 'base64');
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4e); // N
      expect(buffer[3]).toBe(0x47); // G
    });

    it('should be small (under 100 bytes)', () => {
      const buffer = Buffer.from(TINY_PNG_BASE64, 'base64');
      expect(buffer.length).toBeLessThan(100);
    });
  });

  describe('TINY_PDF', () => {
    it('should be valid base64', () => {
      expect(() => Buffer.from(TINY_PDF_BASE64, 'base64')).not.toThrow();
    });

    it('should have correct MIME type', () => {
      expect(TINY_PDF_MIME_TYPE).toBe('application/pdf');
    });

    it('should start with PDF header', () => {
      const buffer = Buffer.from(TINY_PDF_BASE64, 'base64');
      const header = buffer.slice(0, 8).toString('ascii');
      expect(header).toBe('%PDF-1.4');
    });

    it('should end with %%EOF', () => {
      const buffer = Buffer.from(TINY_PDF_BASE64, 'base64');
      const content = buffer.toString('ascii');
      expect(content).toContain('%%EOF');
    });

    it('should be reasonably small (under 500 bytes)', () => {
      const buffer = Buffer.from(TINY_PDF_BASE64, 'base64');
      expect(buffer.length).toBeLessThan(500);
    });
  });

  describe('data URL functions', () => {
    it('should generate valid PNG data URL', () => {
      const dataUrl = getTinyPngDataUrl();
      expect(dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
      expect(dataUrl).toContain(TINY_PNG_BASE64);
    });

    it('should generate valid PDF data URL', () => {
      const dataUrl = getTinyPdfDataUrl();
      expect(dataUrl).toMatch(/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/);
      expect(dataUrl).toContain(TINY_PDF_BASE64);
    });
  });

  describe('PROBE_PROMPTS', () => {
    it('should have all required prompts', () => {
      expect(PROBE_PROMPTS.text).toBeDefined();
      expect(PROBE_PROMPTS.image).toBeDefined();
      expect(PROBE_PROMPTS.pdf).toBeDefined();
      expect(PROBE_PROMPTS.schema).toBeDefined();
    });

    it('should be short and non-destructive', () => {
      // Prompts should be short to minimize tokens
      expect(PROBE_PROMPTS.text.length).toBeLessThan(100);
      expect(PROBE_PROMPTS.image.length).toBeLessThan(100);
      expect(PROBE_PROMPTS.pdf.length).toBeLessThan(100);
      expect(PROBE_PROMPTS.schema.length).toBeLessThan(100);

      // Prompts should not ask for anything harmful
      const allPrompts = Object.values(PROBE_PROMPTS).join(' ').toLowerCase();
      expect(allPrompts).not.toContain('delete');
      expect(allPrompts).not.toContain('modify');
      expect(allPrompts).not.toContain('execute');
    });
  });

  describe('getFixtureStats', () => {
    it('should return size information', () => {
      const stats = getFixtureStats();
      expect(stats.pngSizeBytes).toBeGreaterThan(0);
      expect(stats.pdfSizeBytes).toBeGreaterThan(0);
      expect(stats.pngSizeBytes).toBeLessThan(100);
      expect(stats.pdfSizeBytes).toBeLessThan(500);
    });
  });
});
