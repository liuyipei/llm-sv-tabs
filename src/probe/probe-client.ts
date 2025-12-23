/**
 * Probe HTTP Client
 *
 * HTTP client for making probe requests with timeout and retry support.
 * Designed for headless (non-Electron) operation.
 */

import type { ProbeConfig, ProbeResult } from './types.js';

/**
 * HTTP response for probe analysis
 */
export interface ProbeHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyJson?: unknown;
  streamStarted?: boolean;
}

/**
 * Probe request configuration
 */
export interface ProbeRequest {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body?: unknown;
  stream?: boolean;
}

/**
 * AbortController wrapper for timeout
 */
function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Make a probe HTTP request with timeout
 */
export async function makeProbeRequest(
  request: ProbeRequest,
  config: ProbeConfig
): Promise<ProbeHttpResponse> {
  const { controller, timeoutId } = createTimeoutController(config.timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Collect response headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Read body (for non-streaming responses)
    let body = '';
    let bodyJson: unknown = undefined;
    let streamStarted = false;

    if (request.stream && response.body) {
      // For streaming, just check if we can read some content
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        const { value, done } = await reader.read();
        if (!done && value) {
          streamStarted = true;
          body = decoder.decode(value, { stream: true });
        }
        // Cancel the rest of the stream to save resources
        await reader.cancel();
      } catch (streamError) {
        // Stream error, but we may have gotten started
      }
    } else {
      body = await response.text();
      try {
        bodyJson = JSON.parse(body);
      } catch {
        // Not JSON, keep as string
      }
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      bodyJson,
      streamStarted,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 0,
        statusText: 'Timeout',
        headers: {},
        body: '',
      };
    }

    throw error;
  }
}

/**
 * Parse error information from a probe response
 */
export function parseProbeError(
  response: ProbeHttpResponse
): { errorCode?: string; errorMessage?: string } {
  const result: { errorCode?: string; errorMessage?: string } = {};

  if (response.bodyJson && typeof response.bodyJson === 'object') {
    const json = response.bodyJson as Record<string, unknown>;

    // OpenAI-style error
    if (json.error && typeof json.error === 'object') {
      const error = json.error as Record<string, unknown>;
      result.errorCode = String(error.code || error.type || '');
      result.errorMessage = String(error.message || '');
    }
    // Anthropic-style error
    else if (json.type === 'error' && json.error) {
      const error = json.error as Record<string, unknown>;
      result.errorCode = String(error.type || '');
      result.errorMessage = String(error.message || '');
    }
    // Direct message field
    else if (json.message) {
      result.errorMessage = String(json.message);
    }
  }

  // Fall back to status text
  if (!result.errorMessage && response.statusText !== 'OK') {
    result.errorMessage = response.statusText;
  }

  return result;
}

/**
 * Check if the error indicates a schema/format issue
 */
export function detectSchemaError(
  response: ProbeHttpResponse
): string | undefined {
  const errorText = JSON.stringify(response.bodyJson || response.body).toLowerCase();

  // Common schema error patterns
  const schemaPatterns: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /invalid.*content.*type/i, description: 'Invalid content type' },
    { pattern: /invalid.*message.*format/i, description: 'Invalid message format' },
    { pattern: /invalid.*role/i, description: 'Invalid role' },
    { pattern: /content.*must.*be.*string/i, description: 'Content must be string' },
    { pattern: /content.*must.*be.*array/i, description: 'Content must be array' },
    { pattern: /unsupported.*image/i, description: 'Unsupported image format' },
    { pattern: /invalid.*image/i, description: 'Invalid image' },
    { pattern: /image.*url.*required/i, description: 'Image URL required' },
    { pattern: /base64.*required/i, description: 'Base64 encoding required' },
    { pattern: /not.*support.*vision/i, description: 'Vision not supported' },
    { pattern: /not.*support.*image/i, description: 'Images not supported' },
    { pattern: /not.*support.*pdf/i, description: 'PDF not supported' },
    { pattern: /invalid.*media.*type/i, description: 'Invalid media type' },
    { pattern: /unknown.*field/i, description: 'Unknown field in request' },
    { pattern: /unexpected.*field/i, description: 'Unexpected field in request' },
  ];

  for (const { pattern, description } of schemaPatterns) {
    if (pattern.test(errorText)) {
      return description;
    }
  }

  return undefined;
}

/**
 * Check if error indicates the feature is not supported
 */
export function isFeatureNotSupportedError(
  response: ProbeHttpResponse
): boolean {
  if (response.status === 400 || response.status === 422) {
    const schemaError = detectSchemaError(response);
    if (schemaError) {
      return schemaError.includes('not supported') ||
             schemaError.includes('not support');
    }
  }
  return false;
}

/**
 * Sleep helper for retries
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a probe with retries
 */
export async function executeProbeWithRetry(
  makeRequest: () => Promise<ProbeResult>,
  config: ProbeConfig,
  shouldRetry: (result: ProbeResult) => boolean = (r) => !r.success
): Promise<{ results: ProbeResult[]; finalSuccess: boolean }> {
  const results: ProbeResult[] = [];

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(config.retryDelayMs);
    }

    const result = await makeRequest();
    results.push(result);

    if (!shouldRetry(result)) {
      return { results, finalSuccess: result.success };
    }
  }

  return { results, finalSuccess: false };
}
