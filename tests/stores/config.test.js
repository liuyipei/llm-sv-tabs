import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  provider,
  model,
  apiKeys,
  maxTokens,
  temperature,
  systemPrompt,
} from '../../src/ui/stores/config.js';

describe('config store', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('persisted stores', () => {
    it('should initialize with default values', () => {
      expect(get(provider)).toBe('openai');
      expect(get(model)).toBe(null);
      expect(get(apiKeys)).toEqual({});
      expect(get(maxTokens)).toBe(2000);
      expect(get(temperature)).toBe(0.7);
      expect(get(systemPrompt)).toBe('');
    });

    it('should persist provider to localStorage', () => {
      provider.set('anthropic');
      expect(localStorage.getItem('provider')).toBe('"anthropic"');
    });

    it('should persist apiKeys to localStorage', () => {
      apiKeys.set({ openai: 'key-123', anthropic: 'key-456' });
      const stored = JSON.parse(localStorage.getItem('apiKeys'));
      expect(stored).toEqual({ openai: 'key-123', anthropic: 'key-456' });
    });

    it('should persist maxTokens to localStorage', () => {
      maxTokens.set(4000);
      expect(localStorage.getItem('maxTokens')).toBe('4000');
    });

    it('should persist temperature to localStorage', () => {
      temperature.set(0.9);
      expect(localStorage.getItem('temperature')).toBe('0.9');
    });

    it('should persist systemPrompt to localStorage', () => {
      systemPrompt.set('You are a helpful assistant.');
      expect(localStorage.getItem('systemPrompt')).toBe('"You are a helpful assistant."');
    });
  });

  describe('localStorage integration', () => {
    it('should update store when value changes', () => {
      let currentProvider;
      const unsubscribe = provider.subscribe((value) => {
        currentProvider = value;
      });

      provider.set('anthropic');
      expect(currentProvider).toBe('anthropic');

      unsubscribe();
    });

    it('should handle complex objects in apiKeys', () => {
      const keys = {
        openai: 'sk-123',
        anthropic: 'sk-456',
        google: 'sk-789',
      };

      apiKeys.set(keys);
      const stored = JSON.parse(localStorage.getItem('apiKeys'));
      expect(stored).toEqual(keys);
    });
  });

  describe('reactivity', () => {
    it('should notify subscribers when provider changes', () => {
      let callCount = 0;
      const unsubscribe = provider.subscribe(() => callCount++);

      provider.set('anthropic');
      provider.set('openai');

      expect(callCount).toBeGreaterThanOrEqual(2); // At least 2 updates

      unsubscribe();
    });

    it('should notify subscribers when apiKeys changes', () => {
      let currentKeys;
      const unsubscribe = apiKeys.subscribe((value) => {
        currentKeys = value;
      });

      apiKeys.set({ openai: 'key-1' });
      expect(currentKeys).toEqual({ openai: 'key-1' });

      apiKeys.set({ openai: 'key-1', anthropic: 'key-2' });
      expect(currentKeys).toEqual({ openai: 'key-1', anthropic: 'key-2' });

      unsubscribe();
    });
  });
});
