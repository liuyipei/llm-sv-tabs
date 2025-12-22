/**
 * Tests for model capabilities cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initializeCache,
  getCache,
  getCapabilities,
  getCapabilitySource,
  setLocalOverride,
  removeLocalOverride,
  clearLocalOverrides,
  updateCacheFromProbeResult,
  clearCache,
  makeCacheKey,
  parseCacheKey,
  getStaticOverride,
  getProviderDefaults,
  getCacheStats,
} from '../../src/probe/cache';
import type { ModelProbeResult, ProbedCapabilities } from '../../src/probe/types';

describe('cache', () => {
  beforeEach(() => {
    clearCache();
    clearLocalOverrides();
  });

  describe('makeCacheKey / parseCacheKey', () => {
    it('should create a cache key from provider and model', () => {
      const key = makeCacheKey('openai', 'gpt-4o');
      expect(key).toBe('openai:gpt-4o');
    });

    it('should parse a cache key', () => {
      const result = parseCacheKey('anthropic:claude-3-opus');
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-3-opus',
      });
    });

    it('should handle models with colons', () => {
      const key = makeCacheKey('openrouter', 'anthropic/claude-3:latest');
      expect(key).toBe('openrouter:anthropic/claude-3:latest');

      const parsed = parseCacheKey(key);
      expect(parsed?.model).toBe('anthropic/claude-3:latest');
    });

    it('should return null for invalid key', () => {
      expect(parseCacheKey('no-colon')).toBeNull();
    });
  });

  describe('getStaticOverride', () => {
    it('should return override for GPT-4o', () => {
      const override = getStaticOverride('openai', 'gpt-4o');
      expect(override).not.toBeNull();
      expect(override?.supportsVision).toBe(true);
    });

    it('should return override for Claude-3 models', () => {
      const override = getStaticOverride('anthropic', 'claude-3-opus-20240229');
      expect(override).not.toBeNull();
      expect(override?.supportsVision).toBe(true);
      expect(override?.supportsPdfNative).toBe(true);
    });

    it('should return null for unknown model', () => {
      const override = getStaticOverride('openai', 'some-unknown-model');
      expect(override).toBeNull();
    });

    it('should match Ollama vision models', () => {
      const override = getStaticOverride('ollama', 'llava:latest');
      expect(override).not.toBeNull();
      expect(override?.supportsVision).toBe(true);
    });
  });

  describe('getProviderDefaults', () => {
    it('should return defaults for OpenAI', () => {
      const defaults = getProviderDefaults('openai');
      expect(defaults.messageShape).toBe('openai.parts');
    });

    it('should return defaults for Anthropic', () => {
      const defaults = getProviderDefaults('anthropic');
      expect(defaults.messageShape).toBe('anthropic.content');
      expect(defaults.supportsVision).toBe(true);
      expect(defaults.supportsPdfNative).toBe(true);
    });

    it('should return defaults for Gemini', () => {
      const defaults = getProviderDefaults('gemini');
      expect(defaults.messageShape).toBe('gemini.parts');
    });
  });

  describe('capability resolution with precedence', () => {
    it('should return provider defaults for unknown model', () => {
      const caps = getCapabilities('openai', 'unknown-model-xyz');
      expect(caps.messageShape).toBe('openai.parts');
      expect(caps.supportsVision).toBe(false);
    });

    it('should apply static overrides over provider defaults', () => {
      const caps = getCapabilities('openai', 'gpt-4o-mini');
      expect(caps.supportsVision).toBe(true); // From static override
    });

    it('should apply probed cache over static overrides', () => {
      const probeResult: ModelProbeResult = {
        provider: 'openai',
        model: 'gpt-4o',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: {
          primaryResult: { success: false },
          finalSuccess: false,
        },
        pdfProbe: {
          primaryResult: { success: false },
          finalSuccess: false,
        },
        capabilities: {
          supportsVision: false, // Override static
          supportsPdfNative: false,
          supportsPdfAsImages: false,
          requiresBase64Images: true,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 1000,
      };

      updateCacheFromProbeResult(probeResult);

      const caps = getCapabilities('openai', 'gpt-4o');
      expect(caps.supportsVision).toBe(false); // From probed cache
    });

    it('should apply local overrides over everything', () => {
      // First set up probed cache
      const probeResult: ModelProbeResult = {
        provider: 'openai',
        model: 'gpt-4o',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: { primaryResult: { success: true }, finalSuccess: true },
        pdfProbe: { primaryResult: { success: false }, finalSuccess: false },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: false,
          supportsPdfAsImages: false,
          requiresBase64Images: true,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 1000,
      };
      updateCacheFromProbeResult(probeResult);

      // Then set local override
      setLocalOverride('openai', 'gpt-4o', {
        supportsVision: false,
        supportsPdfNative: true,
      });

      const caps = getCapabilities('openai', 'gpt-4o');
      expect(caps.supportsVision).toBe(false); // From local override
      expect(caps.supportsPdfNative).toBe(true); // From local override
    });
  });

  describe('getCapabilitySource', () => {
    it('should return provider-default for unknown model', () => {
      const source = getCapabilitySource('openai', 'unknown-xyz');
      expect(source).toBe('provider-default');
    });

    it('should return static-override for known model', () => {
      const source = getCapabilitySource('openai', 'gpt-4o');
      expect(source).toBe('static-override');
    });

    it('should return probed when cache exists', () => {
      updateCacheFromProbeResult({
        provider: 'openai',
        model: 'test-model',
        probedAt: Date.now(),
        textProbe: { success: true },
        imageProbe: { primaryResult: { success: true }, finalSuccess: true },
        pdfProbe: { primaryResult: { success: false }, finalSuccess: false },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: false,
          supportsPdfAsImages: true,
          requiresBase64Images: false,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 500,
      });

      const source = getCapabilitySource('openai', 'test-model');
      expect(source).toBe('probed');
    });

    it('should return local-override when set', () => {
      setLocalOverride('openai', 'some-model', { supportsVision: true });
      const source = getCapabilitySource('openai', 'some-model');
      expect(source).toBe('local-override');
    });
  });

  describe('local overrides', () => {
    it('should set and remove local overrides', () => {
      setLocalOverride('openai', 'test', { supportsVision: true });
      expect(getCapabilitySource('openai', 'test')).toBe('local-override');

      removeLocalOverride('openai', 'test');
      expect(getCapabilitySource('openai', 'test')).not.toBe('local-override');
    });

    it('should clear all local overrides', () => {
      setLocalOverride('openai', 'test1', { supportsVision: true });
      setLocalOverride('anthropic', 'test2', { supportsVision: false });

      clearLocalOverrides();

      expect(getCapabilitySource('openai', 'test1')).not.toBe('local-override');
      expect(getCapabilitySource('anthropic', 'test2')).not.toBe('local-override');
    });
  });

  describe('getCacheStats', () => {
    it('should return empty stats for empty cache', () => {
      const stats = getCacheStats();
      expect(stats.modelCount).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });

    it('should return stats for populated cache', () => {
      const now = Date.now();
      const older = now - 10000;

      updateCacheFromProbeResult({
        provider: 'openai',
        model: 'model1',
        probedAt: older,
        textProbe: { success: true },
        imageProbe: { primaryResult: { success: true }, finalSuccess: true },
        pdfProbe: { primaryResult: { success: false }, finalSuccess: false },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: false,
          supportsPdfAsImages: true,
          requiresBase64Images: false,
          requiresImagesFirst: false,
          messageShape: 'openai.parts',
          completionShape: 'openai.streaming',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 500,
      });

      updateCacheFromProbeResult({
        provider: 'anthropic',
        model: 'model2',
        probedAt: now,
        textProbe: { success: true },
        imageProbe: { primaryResult: { success: true }, finalSuccess: true },
        pdfProbe: { primaryResult: { success: true }, finalSuccess: true },
        capabilities: {
          supportsVision: true,
          supportsPdfNative: true,
          supportsPdfAsImages: true,
          requiresBase64Images: true,
          requiresImagesFirst: false,
          messageShape: 'anthropic.content',
          completionShape: 'anthropic.sse',
        },
        probeVersion: '1.0.0',
        totalProbeTimeMs: 600,
      });

      const stats = getCacheStats();
      expect(stats.modelCount).toBe(2);
      expect(stats.oldestEntry).toBe(older);
      expect(stats.newestEntry).toBe(now);
      expect(stats.providerBreakdown.openai).toBe(1);
      expect(stats.providerBreakdown.anthropic).toBe(1);
    });
  });
});
