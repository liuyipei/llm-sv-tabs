/**
 * Capability Inference
 *
 * Analyzes probe results to infer model capabilities and quirks.
 */

import type { ProviderType } from '../types';
import type {
  ProbeConfig,
  ProbedCapabilities,
  ModelProbeResult,
  ProbeResult,
  ProbeWithRetryResult,
  MessageShape,
  CompletionShape,
  DEFAULT_PROBE_CONFIG,
} from './types';
import { probeText, probeImage, probePdf, probeSchema, probeStreaming } from './probes';

const PROBE_VERSION = '1.0.0';

/**
 * Run all probes for a model and infer capabilities
 */
export async function probeModel(
  provider: ProviderType,
  model: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
  config: ProbeConfig
): Promise<ModelProbeResult> {
  const startTime = Date.now();

  // Run text probe first (sanity check)
  const textProbe = await probeText(provider, model, apiKey, endpoint, config);

  // If text probe fails, we can't reliably test other capabilities
  if (!textProbe.success) {
    return buildFailedProbeResult(provider, model, textProbe, startTime);
  }

  // Run image and PDF probes in parallel
  const [imageProbe, pdfProbe] = await Promise.all([
    probeImage(provider, model, apiKey, endpoint, config),
    probePdf(provider, model, apiKey, endpoint, config),
  ]);

  // Run schema probe
  const { result: schemaResult, detectedShape: messageShape } = await probeSchema(
    provider, model, apiKey, endpoint, config
  );

  // Optionally run streaming probe
  let streamingProbe: ProbeResult | undefined;
  let completionShape: CompletionShape = 'unknown';

  if (!config.skipStreamingProbe) {
    const { result, detectedShape } = await probeStreaming(
      provider, model, apiKey, endpoint, config
    );
    streamingProbe = result;
    completionShape = detectedShape;
  } else {
    // Infer from provider
    completionShape = inferCompletionShapeFromProvider(provider);
  }

  // Infer capabilities from probe results
  const capabilities = inferCapabilities(
    imageProbe,
    pdfProbe,
    messageShape,
    completionShape
  );

  return {
    provider,
    model,
    probedAt: Date.now(),
    textProbe,
    imageProbe,
    pdfProbe,
    schemaProbe: schemaResult,
    streamingProbe,
    capabilities,
    probeVersion: PROBE_VERSION,
    totalProbeTimeMs: Date.now() - startTime,
  };
}

/**
 * Build a failed probe result when text probe fails
 */
function buildFailedProbeResult(
  provider: ProviderType,
  model: string,
  textProbe: ProbeResult,
  startTime: number
): ModelProbeResult {
  return {
    provider,
    model,
    probedAt: Date.now(),
    textProbe,
    imageProbe: {
      primaryResult: { success: false, errorMessage: 'Skipped: text probe failed' },
      finalSuccess: false,
    },
    pdfProbe: {
      primaryResult: { success: false, errorMessage: 'Skipped: text probe failed' },
      finalSuccess: false,
    },
    capabilities: getDefaultCapabilities(),
    probeVersion: PROBE_VERSION,
    totalProbeTimeMs: Date.now() - startTime,
  };
}

/**
 * Infer capabilities from probe results
 */
function inferCapabilities(
  imageProbe: ProbeWithRetryResult,
  pdfProbe: ProbeWithRetryResult,
  messageShape: MessageShape,
  completionShape: CompletionShape
): ProbedCapabilities {
  // Determine vision support
  const supportsVision = imageProbe.finalSuccess;

  // Determine PDF support
  const supportsPdfNative = pdfProbe.finalSuccess &&
    (!pdfProbe.successfulVariant?.asPdfImages);
  const supportsPdfAsImages = pdfProbe.finalSuccess &&
    (pdfProbe.successfulVariant?.asPdfImages === true || supportsVision);

  // Determine image quirks
  const requiresBase64Images = imageProbe.successfulVariant?.useBase64 === true;
  const requiresImagesFirst = imageProbe.successfulVariant?.imagesFirst === true;

  return {
    supportsVision,
    supportsPdfNative,
    supportsPdfAsImages: supportsPdfAsImages || supportsVision, // If vision works, PDF-as-images should work
    requiresBase64Images,
    requiresImagesFirst,
    messageShape,
    completionShape,
  };
}

/**
 * Get default capabilities (conservative, text-only)
 */
export function getDefaultCapabilities(): ProbedCapabilities {
  return {
    supportsVision: false,
    supportsPdfNative: false,
    supportsPdfAsImages: false,
    requiresBase64Images: true,
    requiresImagesFirst: false,
    messageShape: 'openai.parts',
    completionShape: 'openai.streaming',
  };
}

/**
 * Infer completion shape from provider type
 */
function inferCompletionShapeFromProvider(provider: ProviderType): CompletionShape {
  switch (provider) {
    case 'anthropic':
      return 'anthropic.sse';
    case 'gemini':
      return 'gemini.streaming';
    default:
      return 'openai.streaming';
  }
}

// ============================================================================
// Probe Multiple Models
// ============================================================================

export interface ProbeProgress {
  current: number;
  total: number;
  model: string;
  provider: ProviderType;
  status: 'probing' | 'done' | 'error';
}

export type ProgressCallback = (progress: ProbeProgress) => void;

/**
 * Probe multiple models with progress reporting
 */
export async function probeModels(
  models: Array<{ provider: ProviderType; model: string }>,
  getApiKey: (provider: ProviderType) => string | undefined,
  getEndpoint: (provider: ProviderType) => string | undefined,
  config: ProbeConfig,
  onProgress?: ProgressCallback
): Promise<ModelProbeResult[]> {
  const results: ModelProbeResult[] = [];

  for (let i = 0; i < models.length; i++) {
    const { provider, model } = models[i];

    onProgress?.({
      current: i + 1,
      total: models.length,
      model,
      provider,
      status: 'probing',
    });

    try {
      const apiKey = getApiKey(provider);
      const endpoint = getEndpoint(provider);
      const result = await probeModel(provider, model, apiKey, endpoint, config);
      results.push(result);

      onProgress?.({
        current: i + 1,
        total: models.length,
        model,
        provider,
        status: 'done',
      });
    } catch (error) {
      // Create a failed result
      results.push({
        provider,
        model,
        probedAt: Date.now(),
        textProbe: {
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        imageProbe: {
          primaryResult: { success: false, errorMessage: 'Probe error' },
          finalSuccess: false,
        },
        pdfProbe: {
          primaryResult: { success: false, errorMessage: 'Probe error' },
          finalSuccess: false,
        },
        capabilities: getDefaultCapabilities(),
        probeVersion: PROBE_VERSION,
        totalProbeTimeMs: 0,
      });

      onProgress?.({
        current: i + 1,
        total: models.length,
        model,
        provider,
        status: 'error',
      });
    }
  }

  return results;
}

// ============================================================================
// Result Analysis
// ============================================================================

/**
 * Summarize probe results for display
 */
export function summarizeProbeResult(result: ModelProbeResult): {
  success: boolean;
  vision: 'yes' | 'no' | 'partial';
  pdf: 'native' | 'images' | 'no';
  issues: string[];
} {
  const issues: string[] = [];

  // Check for errors
  if (!result.textProbe.success) {
    issues.push(`Text probe failed: ${result.textProbe.errorMessage || 'unknown error'}`);
  }
  if (!result.imageProbe.finalSuccess && result.imageProbe.primaryResult.errorMessage) {
    issues.push(`Image: ${result.imageProbe.primaryResult.errorMessage}`);
  }
  if (!result.pdfProbe.finalSuccess && result.pdfProbe.primaryResult.errorMessage) {
    issues.push(`PDF: ${result.pdfProbe.primaryResult.errorMessage}`);
  }

  // Determine vision status
  let vision: 'yes' | 'no' | 'partial' = 'no';
  if (result.capabilities.supportsVision) {
    vision = (result.capabilities.requiresBase64Images ||
              result.capabilities.requiresImagesFirst) ? 'partial' : 'yes';
  }

  // Determine PDF status
  let pdf: 'native' | 'images' | 'no' = 'no';
  if (result.capabilities.supportsPdfNative) {
    pdf = 'native';
  } else if (result.capabilities.supportsPdfAsImages) {
    pdf = 'images';
  }

  return {
    success: result.textProbe.success,
    vision,
    pdf,
    issues,
  };
}
