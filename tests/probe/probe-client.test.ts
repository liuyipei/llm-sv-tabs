/**
 * Tests for probe HTTP client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  makeProbeRequest,
  parseProbeError,
  detectSchemaError,
  isFeatureNotSupportedError,
  executeProbeWithRetry,
} from '../../src/probe/probe-client';
import { DEFAULT_PROBE_CONFIG } from '../../src/probe/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('probe-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('makeProbeRequest', () => {
    it('should make a successful POST request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: vi.fn().mockResolvedValue('{"result": "ok"}'),
      };
      mockResponse.headers.forEach = (cb: any) => {
        cb('application/json', 'content-type');
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await makeProbeRequest(
        {
          url: 'https://api.example.com/chat',
          method: 'POST',
          headers: { 'Authorization': 'Bearer test' },
          body: { messages: [] },
        },
        { ...DEFAULT_PROBE_CONFIG, timeoutMs: 5000 }
      );

      expect(result.status).toBe(200);
      expect(result.bodyJson).toEqual({ result: 'ok' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test',
          }),
        })
      );
    });

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        text: vi.fn().mockResolvedValue('{"error": {"message": "Invalid API key"}}'),
      };
      mockResponse.headers.forEach = () => {};
      mockFetch.mockResolvedValue(mockResponse);

      const result = await makeProbeRequest(
        {
          url: 'https://api.example.com/chat',
          method: 'POST',
          headers: {},
        },
        DEFAULT_PROBE_CONFIG
      );

      expect(result.status).toBe(401);
      expect(result.bodyJson).toEqual({ error: { message: 'Invalid API key' } });
    });

    it('should handle timeout', async () => {
      // Make fetch return a promise that never resolves but respects AbortSignal
      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((_, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }
        });
      });

      const result = await makeProbeRequest(
        {
          url: 'https://api.example.com/chat',
          method: 'POST',
          headers: {},
        },
        { ...DEFAULT_PROBE_CONFIG, timeoutMs: 50 }
      );

      expect(result.status).toBe(0);
      expect(result.statusText).toBe('Timeout');
    });
  });

  describe('parseProbeError', () => {
    it('should parse OpenAI-style errors', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          error: {
            code: 'invalid_api_key',
            message: 'Incorrect API key provided',
          },
        },
      };

      const result = parseProbeError(response);

      expect(result.errorCode).toBe('invalid_api_key');
      expect(result.errorMessage).toBe('Incorrect API key provided');
    });

    it('should parse Anthropic-style errors', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid content type',
          },
        },
      };

      const result = parseProbeError(response);

      expect(result.errorCode).toBe('invalid_request_error');
      expect(result.errorMessage).toBe('Invalid content type');
    });

    it('should fallback to status text', () => {
      const response = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: '',
      };

      const result = parseProbeError(response);

      expect(result.errorMessage).toBe('Internal Server Error');
    });
  });

  describe('detectSchemaError', () => {
    it('should detect content type errors', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          error: { message: 'Invalid content type in message' },
        },
      };

      const result = detectSchemaError(response);

      expect(result).toBe('Invalid content type');
    });

    it('should detect vision not supported', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          error: { message: 'This model does not support vision' },
        },
      };

      const result = detectSchemaError(response);

      expect(result).toBe('Vision not supported');
    });

    it('should detect base64 required', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          error: { message: 'Base64 encoding required for images' },
        },
      };

      const result = detectSchemaError(response);

      expect(result).toBe('Base64 encoding required');
    });

    it('should return undefined for unknown errors', () => {
      const response = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: '',
        bodyJson: {
          error: { message: 'Something went wrong' },
        },
      };

      const result = detectSchemaError(response);

      expect(result).toBeUndefined();
    });
  });

  describe('isFeatureNotSupportedError', () => {
    it('should return true for 400 with vision not supported', () => {
      const response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: '',
        bodyJson: {
          error: { message: 'This model does not support vision' },
        },
      };

      expect(isFeatureNotSupportedError(response)).toBe(true);
    });

    it('should return false for successful response', () => {
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '',
        bodyJson: {},
      };

      expect(isFeatureNotSupportedError(response)).toBe(false);
    });
  });

  describe('executeProbeWithRetry', () => {
    it('should succeed on first try', async () => {
      const makeRequest = vi.fn().mockResolvedValue({ success: true });

      const result = await executeProbeWithRetry(
        makeRequest,
        { ...DEFAULT_PROBE_CONFIG, maxRetries: 2 }
      );

      expect(result.finalSuccess).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(makeRequest).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const makeRequest = vi.fn()
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValueOnce({ success: true });

      const result = await executeProbeWithRetry(
        makeRequest,
        { ...DEFAULT_PROBE_CONFIG, maxRetries: 2, retryDelayMs: 10 }
      );

      expect(result.finalSuccess).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(makeRequest).toHaveBeenCalledTimes(3);
    });

    it('should give up after max retries', async () => {
      const makeRequest = vi.fn().mockResolvedValue({ success: false });

      const result = await executeProbeWithRetry(
        makeRequest,
        { ...DEFAULT_PROBE_CONFIG, maxRetries: 2, retryDelayMs: 10 }
      );

      expect(result.finalSuccess).toBe(false);
      expect(result.results).toHaveLength(3); // 1 initial + 2 retries
      expect(makeRequest).toHaveBeenCalledTimes(3);
    });
  });
});
