/**
 * Tests for capability inference
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultCapabilities,
  summarizeProbeResult,
} from '../../src/probe/inference';
import type { ModelProbeResult } from '../../src/probe/types';

describe('inference', () => {
  describe('getDefaultCapabilities', () => {
    it('should return conservative defaults', () => {
      const defaults = getDefaultCapabilities();

      expect(defaults.supportsVision).toBe(false);
      expect(defaults.supportsPdfNative).toBe(false);
      expect(defaults.supportsPdfAsImages).toBe(false);
      expect(defaults.requiresBase64Images).toBe(true);
      expect(defaults.requiresImagesFirst).toBe(false);
      expect(defaults.messageShape).toBe('openai.parts');
      expect(defaults.completionShape).toBe('openai.streaming');
    });
  });

  describe('summarizeProbeResult', () => {
    it('should summarize successful probe', () => {
      const result: ModelProbeResult = {
        provider: 'openai',
        model: 'gpt-4o',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: {
          primaryResult: { success: true },
          finalSuccess: true,
        },
        pdfProbe: {
          primaryResult: { success: true },
          finalSuccess: true,
          successfulVariant: { useBase64: true, imagesFirst: false, asPdfImages: false },
        },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: true,
          supportsPdfAsImages: true,
          requiresBase64Images: false,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 1000,
      };

      const summary = summarizeProbeResult(result);

      expect(summary.success).toBe(true);
      expect(summary.vision).toBe('yes');
      expect(summary.pdf).toBe('native');
      expect(summary.issues).toHaveLength(0);
    });

    it('should mark vision as partial when quirks required', () => {
      const result: ModelProbeResult = {
        provider: 'ollama',
        model: 'llava',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: {
          primaryResult: { success: true },
          finalSuccess: true,
          successfulVariant: { useBase64: true, imagesFirst: true },
        },
        pdfProbe: {
          primaryResult: { success: false },
          finalSuccess: false,
        },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: false,
          supportsPdfAsImages: true,
          requiresBase64Images: true,
          requiresImagesFirst: true, // Quirk required
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 800,
      };

      const summary = summarizeProbeResult(result);

      expect(summary.vision).toBe('partial');
      expect(summary.pdf).toBe('images');
    });

    it('should detect failed text probe', () => {
      const result: ModelProbeResult = {
        provider: 'openai',
        model: 'invalid-model',
        probedAt: Date.now(),
        textProbe: {
          success: false,
          errorMessage: 'Model not found',
        },
        imageProbe: {
          primaryResult: { success: false, errorMessage: 'Skipped' },
          finalSuccess: false,
        },
        pdfProbe: {
          primaryResult: { success: false, errorMessage: 'Skipped' },
          finalSuccess: false,
        },
        capabilities: getDefaultCapabilities(),
        probeVersion: '1.0.0',
        totalProbeTimeMs: 200,
      };

      const summary = summarizeProbeResult(result);

      expect(summary.success).toBe(false);
      expect(summary.vision).toBe('no');
      expect(summary.pdf).toBe('no');
      expect(summary.issues.length).toBeGreaterThan(0);
      expect(summary.issues[0]).toContain('Model not found');
    });

    it('should collect all issues', () => {
      const result: ModelProbeResult = {
        provider: 'openai',
        model: 'some-model',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: {
          primaryResult: { success: false, errorMessage: 'Vision not supported' },
          finalSuccess: false,
        },
        pdfProbe: {
          primaryResult: { success: false, errorMessage: 'PDF not supported' },
          finalSuccess: false,
        },
        capabilities: {
          supportsVision: false,
          supportsPdfNative: false,
          supportsPdfAsImages: false,
          requiresBase64Images: true,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 500,
      };

      const summary = summarizeProbeResult(result);

      expect(summary.success).toBe(true);
      expect(summary.issues).toHaveLength(2);
      expect(summary.issues.some(i => i.includes('Vision'))).toBe(true);
      expect(summary.issues.some(i => i.includes('PDF'))).toBe(true);
    });
  });
});
