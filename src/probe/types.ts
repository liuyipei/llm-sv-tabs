/**
 * Model Capability Probing Types
 *
 * Types and interfaces for the active capability probing system that tests
 * LLM model capabilities (vision, PDF support, message formats, etc.)
 */

import type { ProviderType } from '../types';

// ============================================================================
// Core Capability Flags
// ============================================================================

/**
 * Probed capabilities for a specific model
 */
export interface ProbedCapabilities {
  // Core modality support
  supportsVision: boolean;           // Can process image content
  supportsPdfNative: boolean;        // Can process PDF files directly
  supportsPdfAsImages: boolean;      // Can process PDFs rasterized as images

  // Image handling quirks
  requiresBase64Images: boolean;     // Must use base64, not URLs
  requiresImagesFirst: boolean;      // Images must come before text in content

  // Message format shape detected
  messageShape: MessageShape;        // What message format the model accepts

  // Streaming response shape
  completionShape: CompletionShape;  // Streaming vs non-streaming response format
}

/**
 * Message shape variants for different providers/models
 */
export type MessageShape =
  | 'openai.parts'       // OpenAI-style with type+text/image_url parts
  | 'openai.string'      // OpenAI-style with string content only
  | 'anthropic.content'  // Anthropic-style with type+text/image content blocks
  | 'gemini.parts'       // Gemini-style with parts array
  | 'provider.custom'    // Provider-specific custom format
  | 'unknown';           // Could not determine

/**
 * Completion response shape variants
 */
export type CompletionShape =
  | 'openai.streaming'   // data: {"choices":[{"delta":{"content":"..."}}]}
  | 'openai.chunks'      // OpenAI-compatible chunk format
  | 'anthropic.sse'      // Anthropic-style SSE with message_start/content_block_delta
  | 'gemini.streaming'   // Gemini streaming format
  | 'raw.text'           // Simple text response (no structure)
  | 'unknown';           // Could not determine

// ============================================================================
// Probe Result Types
// ============================================================================

/**
 * Result of an individual probe attempt
 */
export interface ProbeResult {
  success: boolean;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  responseStarted?: boolean;    // Did we get any content back?
  contentGenerated?: boolean;   // Did the model generate meaningful output?
  schemaError?: string;         // Detected message/content schema errors
  latencyMs?: number;
}

/**
 * Result of a probe with retry information
 */
export interface ProbeWithRetryResult {
  primaryResult: ProbeResult;
  retryResults?: ProbeResult[];
  finalSuccess: boolean;
  successfulVariant?: ProbeVariant;
}

/**
 * Probe variant used for retries
 */
export interface ProbeVariant {
  useBase64: boolean;
  imagesFirst: boolean;
  asPdfImages?: boolean;  // For PDF probes: send as rasterized images
}

// ============================================================================
// Probe Session Types
// ============================================================================

/**
 * Full result of probing a single model
 */
export interface ModelProbeResult {
  provider: ProviderType;
  model: string;
  probedAt: number;                    // Unix timestamp

  // Individual probe results
  textProbe: ProbeResult;
  imageProbe: ProbeWithRetryResult;
  pdfProbe: ProbeWithRetryResult;
  schemaProbe?: ProbeResult;
  streamingProbe?: ProbeResult;

  // Inferred capabilities
  capabilities: ProbedCapabilities;

  // Metadata
  probeVersion: string;               // Version of probe logic used
  totalProbeTimeMs: number;
}

/**
 * Cache entry for a probed model
 */
export interface CachedModelCapabilities {
  provider: ProviderType;
  model: string;
  capabilities: ProbedCapabilities;
  lastProbedAt: number;              // Unix timestamp
  probeVersion: string;
  source: 'probed' | 'static-override' | 'provider-default';
}

/**
 * The full capabilities cache file format
 */
export interface ModelCapabilitiesCache {
  version: string;                    // Cache format version
  lastUpdated: number;               // Unix timestamp
  models: Record<string, CachedModelCapabilities>;  // key: "provider:model"
}

// ============================================================================
// Probe Configuration
// ============================================================================

/**
 * Configuration for running probes
 */
export interface ProbeConfig {
  timeoutMs: number;                  // Timeout for each probe request
  maxRetries: number;                 // Max retries for each probe type
  retryDelayMs: number;              // Delay between retries
  skipStreamingProbe: boolean;       // Skip the streaming probe (saves time)
  verboseLogging: boolean;           // Enable detailed logging
}

/**
 * Default probe configuration
 */
export const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  timeoutMs: 15000,                   // 15 seconds
  maxRetries: 2,
  retryDelayMs: 500,
  skipStreamingProbe: true,          // Skip by default to reduce API calls
  verboseLogging: false,
};

// ============================================================================
// Quick List Types (for CLI input)
// ============================================================================

/**
 * Quick list model entry (matches renderer store format)
 */
export interface QuickListModel {
  provider: ProviderType;
  model: string;
}

/**
 * API key configuration for CLI
 */
export interface ApiKeyConfig {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  xai?: string;
  openrouter?: string;
  fireworks?: string;
  ollama?: string;
  lmstudio?: string;
  vllm?: string;
  minimax?: string;
  'local-openai-compatible'?: string;
}

// ============================================================================
// Static Overrides
// ============================================================================

/**
 * Static capability overrides for known models
 * These can be used when probing is not possible or for known-good configurations
 */
export interface StaticCapabilityOverride {
  pattern: string | RegExp;          // Model ID pattern to match
  provider?: ProviderType;           // Optional: only match this provider
  capabilities: Partial<ProbedCapabilities>;
}

// ============================================================================
// CLI Output Types
// ============================================================================

/**
 * Table row for CLI output
 */
export interface ProbeTableRow {
  provider: string;
  model: string;
  vision: string;     // checkmark or x
  pdfNative: string;
  pdfImages: string;
  base64Req: string;
  imgFirst: string;
  msgShape: string;
  status: string;     // 'OK', 'PARTIAL', 'FAILED'
}

/**
 * CLI output format options
 */
export type OutputFormat = 'table' | 'json' | 'minimal';
