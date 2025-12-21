# VLM Capability Detection and Provider Gateway Architecture

## Overview

As of December 2025, vision-language models (VLMs) have diverged significantly in their API requirements, capability reporting, and content ordering constraints. This document describes the architecture for detecting model capabilities, routing multimodal content correctly, and gracefully degrading when features are unavailable.

## The Problem

### Provider Fragmentation

Different providers report capabilities differently:

| Provider | Capability Discovery | Vision Format | Ordering Requirement |
|----------|---------------------|---------------|---------------------|
| OpenAI | Static model list | `image_url` content block | Any |
| Anthropic | Static model list | `image` content block | Any |
| vLLM | `/v1/models` endpoint | `image_url` content block | Model-dependent |
| Ollama | `/api/tags` endpoint | `image_url` content block | Model-dependent |
| OpenRouter | Model metadata API | Pass-through | Model-dependent |

### Content Ordering Crisis

Many 2025 VLMs (Llama 4, Qwen3-VL) return **400 errors** if images appear after text in the content array. This is a breaking change from earlier models that accepted any ordering.

### Closed-Source Model Detection

For hosted endpoints serving closed-source or custom-finetuned models, we cannot reliably infer capabilities from model names. The same model ID might have different capabilities depending on the serving configuration.

## Architecture

### Capability Discovery Ladder

The system uses a priority-ordered discovery mechanism:

```
User Override (highest priority)
       ↓
Runtime Probe Result
       ↓
API Metadata (/v1/models capabilities field)
       ↓
Static Registry (known models)
       ↓
Name Heuristics (lowest priority)
```

Each source has a priority. Higher-priority sources override lower ones, ensuring user preferences always win while allowing automatic discovery to work transparently.

### ModelCapabilities Registry

```typescript
interface ModelCapabilities {
  modelId: string;
  provider: ProviderType;

  // Modality support
  inputModalities: InputModality[];   // 'text' | 'image' | 'video' | 'audio' | 'pdf' | '3d'
  outputModalities: OutputModality[]; // 'text' | 'image' | 'audio' | 'tool_calls'

  // Content handling
  contentOrdering: ContentOrdering;   // 'images_first' | 'text_first' | 'any'

  // Feature support
  supportsStreaming: boolean;
  supportsFunctionCalling?: boolean;
  supportsJsonMode?: boolean;
  supportsSystemPrompt: boolean;

  // Context limits
  contextWindow?: number;
  maxOutputTokens?: number;

  // Provenance
  source: CapabilitySource;
  updatedAt?: number;
}
```

### Runtime Probing

For unknown models, the system probes capabilities with minimal test requests:

```typescript
// Vision probe: Send 1x1 PNG with simple prompt
const visionProbe = {
  model: modelId,
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: TINY_PNG_DATA_URL } },
      { type: 'text', text: 'Reply with exactly: OK' },
    ],
  }],
  max_tokens: 5,
};

// Interpret response:
// - 200 OK → vision supported
// - 400 with "image not supported" → vision not supported
// - 400/500 other → probe inconclusive (retry later)
```

Probe results are cached per `(provider, endpoint, model)` tuple.

### Provider-Specific Adapters

Each provider implements a `CapabilityProbeAdapter`:

```typescript
interface CapabilityProbeAdapter {
  readonly providerType: ProviderType;

  probeVision(endpoint: string, apiKey: string | undefined, modelId: string): Promise<ProbeResult>;
  probeFunctionCalling?(endpoint: string, apiKey: string | undefined, modelId: string): Promise<ProbeResult>;
  fetchFromMetadata?(endpoint: string, apiKey: string | undefined, modelId: string): Promise<ProbeResult>;
}
```

Adapters handle provider-specific:
- Authentication (API key headers, versions)
- Message format (Anthropic uses `image` blocks, others use `image_url`)
- Metadata endpoints (`/v1/models` vs `/api/tags`)

### Content Ordering

The message conversion layer applies per-model ordering:

```typescript
function convertToOpenAIContent(content: MessageContent, ordering: ContentOrdering): any {
  const imageParts = extractImages(content);
  const textParts = extractText(content);

  switch (ordering) {
    case 'images_first':
      return [...imageParts, ...textParts];  // Safe for Llama 4, Qwen3-VL
    case 'text_first':
      return [...textParts, ...imageParts];
    case 'any':
    default:
      return [...imageParts, ...textParts];  // Default to images_first for safety
  }
}
```

### Graceful Degradation

When sending images to a non-vision model:

1. **Detect** via capabilities registry or probe
2. **Strip** images from content, preserving text
3. **Warn** user with inline message: `[Note: Images removed as model does not support vision]`
4. **Proceed** with text-only request

This prevents 400 errors while keeping the user informed.

## Static Model Registry

Built-in capabilities for well-known models (December 2025):

### OpenAI

| Model | Vision | Ordering | Context |
|-------|--------|----------|---------|
| gpt-5.2-high | Yes | Any | 256K |
| gpt-5-omni | Yes | Any | 256K |
| gpt-4.1 | Yes | Any | 1M |
| gpt-4o | Yes | Any | 128K |
| gpt-4o-mini | Yes | Any | 128K |
| o3-vision | Yes | Any | 200K |
| gpt-3.5-turbo | No | N/A | 16K |

### Anthropic

| Model | Vision | Ordering | Context |
|-------|--------|----------|---------|
| claude-4.5-opus | Yes | Any | 200K |
| claude-4.5-sonnet | Yes | Any | 200K |
| claude-opus-4-20250514 | Yes | Any | 200K |
| claude-sonnet-4-20250514 | Yes | Any | 200K |
| claude-3-5-sonnet-20241022 | Yes | Any | 200K |
| claude-3-5-haiku-20241022 | Yes | Any | 200K |

### vLLM (Self-Hosted)

| Model Pattern | Vision | Ordering | Notes |
|--------------|--------|----------|-------|
| `qwen.*vl` | Yes | Images First | Requires images before text |
| `llama.*4` | Yes | Images First | Maverick/Scout variants |
| `llava` | Yes | Any | |
| `cogvlm` | Yes | Any | |
| `internvl` | Yes | Any | |

## User Overrides

Users can override any capability:

```typescript
// Set override (persists across sessions)
setUserOverride('vllm', 'http://localhost:8000', 'my-custom-model', {
  inputModalities: ['text', 'image', 'video'],
  contentOrdering: 'images_first',
});

// Clear override (fall back to auto-detection)
clearUserOverride('vllm', 'http://localhost:8000', 'my-custom-model');
```

Overrides are stored separately and merged at query time, ensuring they always take precedence.

## Future Extensibility

### New Modalities

The type system accommodates future modalities:

```typescript
type InputModality =
  | 'text'
  | 'image'
  | 'video'    // Already supported by GPT-5.2, Gemini 3
  | 'audio'    // GPT-5 Omni, Gemini 3
  | 'pdf'      // Claude, some Gemini models
  | '3d'       // Emerging in 2026 models
  | 'code'
  | 'structured_data';
```

Adding a new modality requires:
1. Add to `InputModality` type
2. Update probe adapters to test for it
3. Add conversion logic to helpers
4. Update static registry with known models

### Provider-Specific Extensions

The `providerMetadata` field allows storing provider-specific capabilities:

```typescript
{
  modelId: 'gemini-3-ultra',
  provider: 'gemini',
  providerMetadata: {
    supportsGrounding: true,
    supportedLanguages: ['en', 'es', 'zh', ...],
    fineTuningEndpoint: 'https://...',
  },
}
```

## Testing Strategy

### Unit Tests

- Capability registry CRUD operations
- Content ordering transformation
- Probe result interpretation
- User override merging

### Integration Tests

- Probe against mock servers
- End-to-end multimodal requests
- Graceful degradation scenarios

### Manual Testing Matrix

| Scenario | Provider | Model | Expected |
|----------|----------|-------|----------|
| Vision to VLM | vLLM | Qwen3-VL | Images processed correctly |
| Vision to text-only | OpenAI | gpt-3.5-turbo | Images stripped with warning |
| Unknown model | vLLM | custom-model | Probe and cache result |
| User override | Any | Any | Override applied |

## Implementation Files

| File | Purpose |
|------|---------|
| `model-capabilities.ts` | Capability registry and types |
| `capability-probes.ts` | Provider-specific probe adapters |
| `vision-capability-probe.ts` | Legacy probe utilities (being migrated) |
| `openai-helpers.ts` | Content conversion with ordering |
| `vllm-provider.ts` | vLLM integration with capability discovery |

## Related Documentation

- [Token Streaming & API Providers](./01-token-streaming-and-providers.md) - Base provider architecture
- [Provider Duplication](./provider-duplication.md) - Why providers have separate implementations
