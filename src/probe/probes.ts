/**
 * Individual Probe Implementations
 *
 * Each probe tests a specific capability of an LLM model.
 */

import type { ProviderType } from '../types';
import type {
  ProbeConfig,
  ProbeResult,
  ProbeWithRetryResult,
  ProbeVariant,
  MessageShape,
  CompletionShape,
} from './types';
import {
  makeProbeRequest,
  parseProbeError,
  detectSchemaError,
  isFeatureNotSupportedError,
  sleep,
} from './probe-client';
import {
  TINY_PNG_BASE64,
  TINY_PNG_MIME_TYPE,
  TINY_PDF_BASE64,
  TINY_PDF_MIME_TYPE,
  PROBE_PROMPTS,
} from './fixtures';
import { getProviderEndpoint, getProviderHeaders, buildMessages } from './provider-adapters';

// ============================================================================
// Unified Probe Runner (Single Source of Truth)
// ============================================================================

interface ProbeOptions {
  provider: ProviderType;
  model: string;
  apiKey?: string;
  endpoint?: string;
  contentType: 'text' | 'image' | 'pdf';
  media?: { base64?: string; dataUrl?: string; mimeType?: string };
  imagesFirst?: boolean;
  stream?: boolean;
}

/**
 * Get the correct token limit field for a provider.
 * OpenAI's newer models require max_completion_tokens instead of max_tokens.
 */
function getTokenLimitBody(provider: ProviderType, limit: number): Record<string, number> {
  if (provider === 'openai') return { max_completion_tokens: limit };
  if (provider === 'anthropic') return { max_tokens: limit };
  return { max_tokens: limit };
}

/**
 * Unified probe runner - all probe types use this single function.
 */
async function runProbe(options: ProbeOptions, config: ProbeConfig): Promise<ProbeResult> {
  const { provider, model, apiKey, endpoint, contentType, media, imagesFirst, stream } = options;
  const startTime = Date.now();

  try {
    const url = getProviderEndpoint(provider, endpoint);
    const headers = getProviderHeaders(provider, apiKey);
    const prompt = contentType === 'text' ? PROBE_PROMPTS.text :
                   contentType === 'image' ? PROBE_PROMPTS.image : PROBE_PROMPTS.pdf;
    const messages = buildMessages(provider, prompt, contentType, media, imagesFirst);

    const response = await makeProbeRequest({
      url,
      method: 'POST',
      headers,
      body: {
        model,
        messages,
        ...getTokenLimitBody(provider, 50),
        stream: stream ?? false,
      },
      stream,
    }, config);

    const latencyMs = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      const hasContent = stream ? response.body.length > 0 : checkResponseHasContent(response.bodyJson);
      return {
        success: true,
        httpStatus: response.status,
        responseStarted: stream ? response.streamStarted : true,
        contentGenerated: hasContent,
        latencyMs,
      };
    }

    const { errorCode, errorMessage } = parseProbeError(response);
    return {
      success: false,
      httpStatus: response.status,
      errorCode,
      errorMessage,
      schemaError: detectSchemaError(response),
      latencyMs,
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Public Probe Functions
// ============================================================================

/** Text sanity probe - tests basic text completion */
export function probeText(
  provider: ProviderType, model: string, apiKey: string | undefined,
  endpoint: string | undefined, config: ProbeConfig
): Promise<ProbeResult> {
  return runProbe({ provider, model, apiKey, endpoint, contentType: 'text' }, config);
}

/** Image probe with retries for different configurations */
export async function probeImage(
  provider: ProviderType, model: string, apiKey: string | undefined,
  endpoint: string | undefined, config: ProbeConfig
): Promise<ProbeWithRetryResult> {
  const variants: ProbeVariant[] = [
    { useBase64: true, imagesFirst: false },
    { useBase64: true, imagesFirst: true },
    { useBase64: false, imagesFirst: false },
    { useBase64: false, imagesFirst: true },
  ];

  const probeWithVariant = (v: ProbeVariant) => runProbe({
    provider, model, apiKey, endpoint,
    contentType: 'image',
    media: v.useBase64
      ? { base64: TINY_PNG_BASE64, mimeType: TINY_PNG_MIME_TYPE }
      : { dataUrl: `data:${TINY_PNG_MIME_TYPE};base64,${TINY_PNG_BASE64}` },
    imagesFirst: v.imagesFirst,
  }, config);

  const primaryResult = await probeWithVariant(variants[0]);
  if (primaryResult.success) {
    return { primaryResult, finalSuccess: true, successfulVariant: variants[0] };
  }

  // Retry with other variants if schema error
  if (primaryResult.schemaError || isFeatureNotSupportedError({
    status: primaryResult.httpStatus || 0, statusText: '', headers: {}, body: '', bodyJson: undefined
  })) {
    const retryResults: ProbeResult[] = [];
    for (let i = 1; i < variants.length && i <= config.maxRetries; i++) {
      await sleep(config.retryDelayMs);
      const result = await probeWithVariant(variants[i]);
      retryResults.push(result);
      if (result.success) {
        return { primaryResult, retryResults, finalSuccess: true, successfulVariant: variants[i] };
      }
    }
    return { primaryResult, retryResults: retryResults.length > 0 ? retryResults : undefined, finalSuccess: false };
  }

  return { primaryResult, finalSuccess: false };
}

/** PDF probe with native and rasterized fallback */
export async function probePdf(
  provider: ProviderType, model: string, apiKey: string | undefined,
  endpoint: string | undefined, config: ProbeConfig
): Promise<ProbeWithRetryResult> {
  // Try native PDF
  const primaryResult = await runProbe({
    provider, model, apiKey, endpoint,
    contentType: 'pdf',
    media: { base64: TINY_PDF_BASE64, mimeType: TINY_PDF_MIME_TYPE },
  }, config);

  if (primaryResult.success) {
    return { primaryResult, finalSuccess: true, successfulVariant: { useBase64: true, imagesFirst: false, asPdfImages: false } };
  }

  // Try PDF-as-images fallback
  if (primaryResult.schemaError?.includes('PDF') || primaryResult.schemaError?.includes('not supported') ||
      primaryResult.httpStatus === 400 || primaryResult.httpStatus === 422) {
    await sleep(config.retryDelayMs);
    const fallbackResult = await runProbe({
      provider, model, apiKey, endpoint,
      contentType: 'image',
      media: { base64: TINY_PNG_BASE64, mimeType: TINY_PNG_MIME_TYPE },
    }, config);

    if (fallbackResult.success) {
      return { primaryResult, retryResults: [fallbackResult], finalSuccess: true,
               successfulVariant: { useBase64: true, imagesFirst: false, asPdfImages: true } };
    }
    return { primaryResult, retryResults: [fallbackResult], finalSuccess: false };
  }

  return { primaryResult, finalSuccess: false };
}

/** Schema probe - detect message shape requirements */
export async function probeSchema(
  provider: ProviderType, model: string, apiKey: string | undefined,
  endpoint: string | undefined, config: ProbeConfig
): Promise<{ result: ProbeResult; detectedShape: MessageShape }> {
  let detectedShape = inferMessageShapeFromProvider(provider);
  const result = await probeText(provider, model, apiKey, endpoint, config);

  if (result.success && detectedShape === 'unknown') detectedShape = 'openai.parts';
  if (result.schemaError?.includes('string')) detectedShape = 'openai.string';
  else if (result.schemaError?.includes('array')) detectedShape = 'openai.parts';

  return { result, detectedShape };
}

/** Streaming probe - detect completion response shape */
export async function probeStreaming(
  provider: ProviderType, model: string, apiKey: string | undefined,
  endpoint: string | undefined, config: ProbeConfig
): Promise<{ result: ProbeResult; detectedShape: CompletionShape }> {
  const result = await runProbe({
    provider, model, apiKey, endpoint, contentType: 'text', stream: true
  }, config);

  return { result, detectedShape: result.success ? inferStreamingShapeFromProvider(provider) : 'unknown' };
}

// ============================================================================
// Helper Functions
// ============================================================================

function checkResponseHasContent(bodyJson: unknown): boolean {
  if (!bodyJson || typeof bodyJson !== 'object') return false;
  const json = bodyJson as Record<string, unknown>;

  // OpenAI-style
  if (Array.isArray(json.choices)) {
    const msg = (json.choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    if (msg) return typeof msg.content === 'string' && msg.content.length > 0;
  }
  // Anthropic-style
  if (Array.isArray(json.content)) {
    const block = json.content[0] as Record<string, unknown> | undefined;
    if (block?.type === 'text') return typeof block.text === 'string' && (block.text as string).length > 0;
  }
  return false;
}

function inferMessageShapeFromProvider(provider: ProviderType): MessageShape {
  const shapes: Partial<Record<ProviderType, MessageShape>> = {
    anthropic: 'anthropic.content',
    gemini: 'gemini.parts',
    minimax: 'openai.string',
  };
  return shapes[provider] ?? 'openai.parts';
}

function inferStreamingShapeFromProvider(provider: ProviderType): CompletionShape {
  if (provider === 'anthropic') return 'anthropic.sse';
  if (provider === 'gemini') return 'gemini.streaming';
  return 'openai.streaming';
}
