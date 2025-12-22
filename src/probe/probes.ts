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

/**
 * Get the correct token limit field name for a provider.
 * OpenAI's newer models require max_completion_tokens instead of max_tokens.
 */
function getTokenLimitBody(provider: ProviderType, limit: number): Record<string, number> {
  // OpenAI and OpenAI-compatible providers (except anthropic/gemini) should use max_completion_tokens
  // for newer models. Using max_completion_tokens is safe for all current OpenAI models.
  if (provider === 'openai') {
    return { max_completion_tokens: limit };
  }
  // Anthropic uses max_tokens
  if (provider === 'anthropic') {
    return { max_tokens: limit };
  }
  // Other OpenAI-compatible providers typically use max_tokens
  return { max_tokens: limit };
}

/**
 * Text sanity probe - tests basic text completion
 */
export async function probeText(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ProbeResult> {
  const startTime = Date.now();

  try {
    const url = getProviderEndpoint(provider, endpoint);
    const headers = getProviderHeaders(provider, apiKey);
    const messages = buildMessages(provider, PROBE_PROMPTS.text, 'text');

    const response = await makeProbeRequest(
      {
        url,
        method: 'POST',
        headers,
        body: {
          model,
          messages,
          ...getTokenLimitBody(provider, 50),
          stream: false,
        },
      },
      config
    );

    const latencyMs = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      // Check if we got meaningful content
      const hasContent = checkResponseHasContent(response.bodyJson);
      return {
        success: true,
        httpStatus: response.status,
        responseStarted: true,
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

/**
 * Image probe with retries for different configurations
 */
export async function probeImage(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ProbeWithRetryResult> {
  // Probe variants to try in order
  const variants: ProbeVariant[] = [
    { useBase64: true, imagesFirst: false },   // Standard: base64, text first
    { useBase64: true, imagesFirst: true },    // Try: base64, images first
    { useBase64: false, imagesFirst: false },  // Try: URL (data URL)
    { useBase64: false, imagesFirst: true },   // Try: URL, images first
  ];

  const retryResults: ProbeResult[] = [];
  let successfulVariant: ProbeVariant | undefined;

  // Try primary configuration first
  const primaryResult = await probeImageWithVariant(
    provider, model, apiKey, endpoint, variants[0], config
  );

  if (primaryResult.success) {
    return {
      primaryResult,
      finalSuccess: true,
      successfulVariant: variants[0],
    };
  }

  // If it looks like a schema error, try other variants
  if (primaryResult.schemaError || isFeatureNotSupportedError({
    status: primaryResult.httpStatus || 0,
    statusText: '',
    headers: {},
    body: '',
    bodyJson: undefined
  })) {
    for (let i = 1; i < variants.length && i <= config.maxRetries; i++) {
      await sleep(config.retryDelayMs);
      const result = await probeImageWithVariant(
        provider, model, apiKey, endpoint, variants[i], config
      );
      retryResults.push(result);

      if (result.success) {
        successfulVariant = variants[i];
        break;
      }
    }
  }

  const finalSuccess = successfulVariant !== undefined;

  return {
    primaryResult,
    retryResults: retryResults.length > 0 ? retryResults : undefined,
    finalSuccess,
    successfulVariant,
  };
}

/**
 * Probe image with a specific configuration variant
 */
async function probeImageWithVariant(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  variant: ProbeVariant,
  config: ProbeConfig
): Promise<ProbeResult> {
  const startTime = Date.now();

  try {
    const url = getProviderEndpoint(provider, endpoint);
    const headers = getProviderHeaders(provider, apiKey);

    const imageContent = variant.useBase64
      ? { base64: TINY_PNG_BASE64, mimeType: TINY_PNG_MIME_TYPE }
      : { dataUrl: `data:${TINY_PNG_MIME_TYPE};base64,${TINY_PNG_BASE64}` };

    const messages = buildMessages(
      provider,
      PROBE_PROMPTS.image,
      'image',
      imageContent,
      variant.imagesFirst
    );

    const response = await makeProbeRequest(
      {
        url,
        method: 'POST',
        headers,
        body: {
          model,
          messages,
          ...getTokenLimitBody(provider, 50),
          stream: false,
        },
      },
      config
    );

    const latencyMs = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      const hasContent = checkResponseHasContent(response.bodyJson);
      return {
        success: true,
        httpStatus: response.status,
        responseStarted: true,
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

/**
 * PDF probe with retries for native PDF and rasterized fallback
 */
export async function probePdf(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ProbeWithRetryResult> {
  // First try native PDF
  const primaryResult = await probePdfNative(provider, model, apiKey, endpoint, config);

  if (primaryResult.success) {
    return {
      primaryResult,
      finalSuccess: true,
      successfulVariant: { useBase64: true, imagesFirst: false, asPdfImages: false },
    };
  }

  // If native PDF failed, try as rasterized images
  const retryResults: ProbeResult[] = [];

  if (primaryResult.schemaError?.includes('PDF') ||
      primaryResult.schemaError?.includes('not supported') ||
      primaryResult.httpStatus === 400 ||
      primaryResult.httpStatus === 422) {
    await sleep(config.retryDelayMs);

    const pdfAsImageResult = await probePdfAsImages(
      provider, model, apiKey, endpoint, config
    );
    retryResults.push(pdfAsImageResult);

    if (pdfAsImageResult.success) {
      return {
        primaryResult,
        retryResults,
        finalSuccess: true,
        successfulVariant: { useBase64: true, imagesFirst: false, asPdfImages: true },
      };
    }
  }

  return {
    primaryResult,
    retryResults: retryResults.length > 0 ? retryResults : undefined,
    finalSuccess: false,
  };
}

/**
 * Probe native PDF support
 */
async function probePdfNative(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ProbeResult> {
  const startTime = Date.now();

  try {
    const url = getProviderEndpoint(provider, endpoint);
    const headers = getProviderHeaders(provider, apiKey);

    const messages = buildMessages(
      provider,
      PROBE_PROMPTS.pdf,
      'pdf',
      { base64: TINY_PDF_BASE64, mimeType: TINY_PDF_MIME_TYPE }
    );

    const response = await makeProbeRequest(
      {
        url,
        method: 'POST',
        headers,
        body: {
          model,
          messages,
          ...getTokenLimitBody(provider, 50),
          stream: false,
        },
      },
      config
    );

    const latencyMs = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      const hasContent = checkResponseHasContent(response.bodyJson);
      return {
        success: true,
        httpStatus: response.status,
        responseStarted: true,
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

/**
 * Probe PDF as rasterized images (fallback)
 */
async function probePdfAsImages(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ProbeResult> {
  // For this probe, we simulate sending PDF page as an image
  // by just using our tiny PNG as if it were a rasterized PDF page
  return probeImageWithVariant(
    provider,
    model,
    apiKey,
    endpoint,
    { useBase64: true, imagesFirst: false },
    config
  );
}

/**
 * Schema probe - detect message shape requirements
 */
export async function probeSchema(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<{ result: ProbeResult; detectedShape: MessageShape }> {
  // Try to determine the message shape by trying different formats
  // and seeing which one succeeds

  const startTime = Date.now();
  let detectedShape: MessageShape = 'unknown';

  // For most providers, we can infer the shape from the provider type
  const inferredShape = inferMessageShapeFromProvider(provider);
  if (inferredShape !== 'unknown') {
    detectedShape = inferredShape;
  }

  // Make a simple request to verify
  const result = await probeText(provider, model, apiKey, endpoint, config);

  // If the probe succeeded, the inferred shape is likely correct
  if (result.success && detectedShape === 'unknown') {
    // Default to OpenAI parts for successful probes without known shape
    detectedShape = 'openai.parts';
  }

  // If there was a schema error, try to determine from the error
  if (result.schemaError) {
    if (result.schemaError.includes('string')) {
      detectedShape = 'openai.string';
    } else if (result.schemaError.includes('array')) {
      detectedShape = 'openai.parts';
    }
  }

  return {
    result: {
      ...result,
      latencyMs: Date.now() - startTime,
    },
    detectedShape,
  };
}

/**
 * Streaming probe - detect completion response shape
 */
export async function probeStreaming(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<{ result: ProbeResult; detectedShape: CompletionShape }> {
  const startTime = Date.now();

  try {
    const url = getProviderEndpoint(provider, endpoint);
    const headers = getProviderHeaders(provider, apiKey);
    const messages = buildMessages(provider, PROBE_PROMPTS.text, 'text');

    const response = await makeProbeRequest(
      {
        url,
        method: 'POST',
        headers,
        body: {
          model,
          messages,
          ...getTokenLimitBody(provider, 50),
          stream: true,
        },
        stream: true,
      },
      config
    );

    const latencyMs = Date.now() - startTime;

    if (response.status >= 200 && response.status < 300) {
      // Detect streaming shape from the response body
      const detectedShape = detectStreamingShape(response.body, provider);

      return {
        result: {
          success: true,
          httpStatus: response.status,
          responseStarted: response.streamStarted,
          contentGenerated: response.body.length > 0,
          latencyMs,
        },
        detectedShape,
      };
    }

    const { errorCode, errorMessage } = parseProbeError(response);
    return {
      result: {
        success: false,
        httpStatus: response.status,
        errorCode,
        errorMessage,
        latencyMs,
      },
      detectedShape: 'unknown',
    };
  } catch (error) {
    return {
      result: {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      },
      detectedShape: 'unknown',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a response JSON contains meaningful content
 */
function checkResponseHasContent(bodyJson: unknown): boolean {
  if (!bodyJson || typeof bodyJson !== 'object') {
    return false;
  }

  const json = bodyJson as Record<string, unknown>;

  // OpenAI-style response
  if (Array.isArray(json.choices)) {
    const choice = json.choices[0] as Record<string, unknown> | undefined;
    if (choice?.message) {
      const message = choice.message as Record<string, unknown>;
      return typeof message.content === 'string' && message.content.length > 0;
    }
  }

  // Anthropic-style response
  if (Array.isArray(json.content)) {
    const block = json.content[0] as Record<string, unknown> | undefined;
    if (block?.type === 'text') {
      return typeof block.text === 'string' && block.text.length > 0;
    }
  }

  return false;
}

/**
 * Infer message shape from provider type
 */
function inferMessageShapeFromProvider(provider: ProviderType): MessageShape {
  switch (provider) {
    case 'anthropic':
      return 'anthropic.content';
    case 'gemini':
      return 'gemini.parts';
    case 'openai':
    case 'openrouter':
    case 'fireworks':
    case 'xai':
    case 'ollama':
    case 'lmstudio':
    case 'vllm':
    case 'local-openai-compatible':
      return 'openai.parts';
    case 'minimax':
      return 'openai.string';
    default:
      return 'unknown';
  }
}

/**
 * Detect streaming response shape from response content
 */
function detectStreamingShape(body: string, provider: ProviderType): CompletionShape {
  // Check for SSE data lines
  if (!body.includes('data:')) {
    return 'raw.text';
  }

  // Try to parse a data line
  const dataMatch = body.match(/data:\s*({.+})/);
  if (!dataMatch) {
    // Anthropic uses event: lines
    if (body.includes('event:')) {
      return 'anthropic.sse';
    }
    return inferStreamingShapeFromProvider(provider);
  }

  try {
    const parsed = JSON.parse(dataMatch[1]) as Record<string, unknown>;

    // Anthropic style
    if (parsed.type === 'content_block_delta' || parsed.type === 'message_start') {
      return 'anthropic.sse';
    }

    // OpenAI style
    if (Array.isArray(parsed.choices)) {
      return 'openai.streaming';
    }
  } catch {
    // JSON parse failed
  }

  return inferStreamingShapeFromProvider(provider);
}

/**
 * Infer streaming shape from provider
 */
function inferStreamingShapeFromProvider(provider: ProviderType): CompletionShape {
  switch (provider) {
    case 'anthropic':
      return 'anthropic.sse';
    case 'gemini':
      return 'gemini.streaming';
    case 'openai':
    case 'openrouter':
    case 'fireworks':
    case 'xai':
    case 'ollama':
    case 'lmstudio':
    case 'vllm':
    case 'local-openai-compatible':
    case 'minimax':
      return 'openai.streaming';
    default:
      return 'unknown';
  }
}
