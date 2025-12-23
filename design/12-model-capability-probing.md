# Model Capability Probing

An active probing system that discovers LLM model capabilities at runtime, enabling automatic adaptation of message formats for vision, PDF, and multimodal content.

## Overview

Different LLM providers and models have varying support for:
- **Vision**: Image understanding (some require base64, others accept URLs)
- **Native PDF**: Direct PDF document handling
- **PDF-as-images**: Fallback rendering of PDF pages as images
- **Message ordering**: Some models require images before text
- **Schema shapes**: OpenAI vs Anthropic vs Gemini message formats

Rather than maintaining a static compatibility matrix, this system probes each model with minimal test fixtures to discover its actual capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Probe System                                 │
│                                                                 │
│  fixtures/index.ts                                              │
│  ├─ TINY_PNG_BASE64      (67 bytes, 1x1 transparent PNG)       │
│  ├─ TINY_PDF_BASE64      (~200 bytes, minimal valid PDF)       │
│  └─ PROBE_PROMPTS        (non-destructive test prompts)        │
│                                                                 │
│  probe-client.ts                                                │
│  ├─ makeProbeRequest()   HTTP with timeout/abort               │
│  ├─ parseProbeError()    Extract error codes/messages          │
│  └─ detectSchemaError()  Identify capability-related failures  │
│                                                                 │
│  provider-adapters.ts                                           │
│  ├─ buildMessages()      Format for OpenAI/Anthropic/Gemini    │
│  └─ getProviderEndpoint() API URLs per provider                │
│                                                                 │
│  probes.ts                                                      │
│  ├─ probeText()          Basic text completion test            │
│  ├─ probeImage()         Vision capability with PNG            │
│  └─ probePdf()           Native PDF document handling          │
│                                                                 │
│  inference.ts                                                   │
│  ├─ probeModel()         Run all probes for one model          │
│  ├─ probeModels()        Batch probe with progress callback    │
│  └─ inferCapabilities()  Derive flags from probe results       │
│                                                                 │
│  cache.ts                                                       │
│  ├─ 4-level precedence   (local > probed > static > defaults)  │
│  └─ File persistence     (~/.llm-tabs/capability-cache.json)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼───────┐   ┌───────▼───────┐
            │  Electron App │   │  Headless CLI │
            │               │   │               │
            │  Quick List   │◄──│  probe:quick  │
            │  UI sync      │   │  list command │
            └───────────────┘   └───────────────┘
                    │                   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ ~/.llm-tabs/      │
                    │ quick-list.json   │
                    │ capability-cache  │
                    └───────────────────┘
```

## Probe Strategy

### 1. Text Probe (Required)
Tests basic API connectivity and model availability:
```typescript
messages: [{ role: 'user', content: 'Reply with the word READY' }]
```

### 2. Image Probe (Optional)
Tests vision capability with a 1x1 transparent PNG:
```typescript
messages: [{
  role: 'user',
  content: [
    { type: 'image_url', url: 'data:image/png;base64,...' },
    { type: 'text', text: 'Describe this image in one word' }
  ]
}]
```

If base64 fails, retries with `requiresBase64Images: false` variant.
If images-first fails, retries with `requiresImagesFirst: true` variant.

### 3. PDF Probe (Optional)
Tests native PDF document handling:
```typescript
messages: [{
  role: 'user',
  content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: '...' }},
    { type: 'text', text: 'What type of document is this?' }
  ]
}]
```

## Capability Flags

```typescript
interface ProbedCapabilities {
  // Vision support
  supportsVision: boolean;
  supportsPdfNative: boolean;
  supportsPdfAsImages: boolean;

  // Quirks
  requiresBase64Images: boolean;  // Cannot use URL references
  requiresImagesFirst: boolean;   // Images must precede text

  // Message format
  messageShape: 'openai.v1' | 'anthropic.messages' | 'gemini.v1beta';

  // Metadata
  probedAt: number;
  probeVersion: string;
}
```

## Cache Precedence

The system uses a 4-level precedence chain:

1. **Local Overrides** (`~/.llm-tabs/local-overrides.json`)
   - User corrections for edge cases
   - Highest priority, never auto-modified

2. **Probed Cache** (`~/.llm-tabs/capability-cache.json`)
   - Results from active probing
   - Updated by CLI or app

3. **Static Overrides** (compiled into app)
   - Known quirks for popular models
   - Fallback when probing isn't possible

4. **Provider Defaults**
   - Baseline assumptions per provider
   - Lowest priority

```typescript
function getCapabilities(provider: ProviderType, model: string): ProbedCapabilities {
  return localOverrides[key]
      ?? probedCache[key]
      ?? staticOverrides[key]
      ?? providerDefaults[provider];
}
```

## Headless CLI

Probe models without running the Electron app:

```bash
# Probe models from browser's quick list (auto-synced)
npm run probe:quicklist

# Probe specific models
npm run probe:quicklist -- --quick-list '[{"provider":"anthropic","model":"claude-sonnet-4-20250514"}]'

# Save results to cache
npm run probe:quicklist -- --write-cache

# Output as JSON for scripting
npm run probe:quicklist -- --json
```

### Quick List Sources (checked in order)
1. `--quick-list` CLI argument
2. `QUICK_LIST_JSON` environment variable
3. `~/.llm-tabs/quick-list.json` (synced from browser app)

### Browser ↔ CLI parity

- The browser writes the quick list to `~/.llm-tabs/quick-list.json` so `npm run probe:quicklist` sees the same model set.
- When API keys or endpoints change in the browser, it forces a fresh probe of quick-list models so cached capability flags stay in sync with the CLI results.
- Probing remains debounced (500 ms) to avoid excessive writes/requests while still ensuring new credentials/endpoint settings immediately refresh capability data.
- The main process prints a CLI-style summary line for each browser-triggered probe (matching quick list additions) so you can compare app results with `npm run probe:quicklist`.

### API Key Sources
1. Environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
2. Keys file: `~/.llm-tabs/keys.json`

## Implementation Details

### Minimal Test Fixtures

Fixtures are designed to minimize API costs and latency:

```typescript
// 1x1 transparent PNG (67 bytes)
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal valid PDF (~200 bytes)
const TINY_PDF_BASE64 = 'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE5OAolJUVPRgo=';
```

### Timeout and Retry Logic

```typescript
const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  timeoutMs: 15000,      // 15s per probe
  maxRetries: 2,         // Retry with variants
  retryDelayMs: 1000,    // Wait between retries
};
```

### Error Detection Patterns

The system recognizes capability-related errors:

| Error Pattern | Interpretation |
|---------------|----------------|
| "does not support vision" | `supportsVision: false` |
| "invalid content type" | Wrong message shape |
| "base64 encoding required" | `requiresBase64Images: true` |
| "image must come before text" | `requiresImagesFirst: true` |
| "PDF not supported" | `supportsPdfNative: false` |

### Browser/CLI Quick List Sync

The Electron app automatically syncs its quick list to a shared file:

```typescript
// src/ui/stores/config.ts
quickSwitchModels.subscribe((models) => {
  // Debounced write to ~/.llm-tabs/quick-list.json
  electronAPI.syncQuickList(models);
});
```

This allows the CLI to probe the same models configured in the browser.

## Type Definitions

```typescript
// Core probe result
interface ProbeResult {
  success: boolean;
  responseText?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
  variant?: string;  // e.g., 'base64', 'url', 'images-first'
}

// Full model probe
interface ModelProbeResult {
  provider: ProviderType;
  model: string;
  textProbe: ProbeResult;
  imageProbe?: ProbeResult;
  pdfProbe?: ProbeResult;
  capabilities: ProbedCapabilities;
  probedAt: number;
}

// Quick list entry
interface QuickListModel {
  provider: ProviderType;
  model: string;
}
```

## Configuration

| Setting | Default | Notes |
|---------|---------|-------|
| `timeoutMs` | 15000 | Probe request timeout |
| `maxRetries` | 2 | Retry attempts per probe type |
| `retryDelayMs` | 1000 | Delay between retries |
| `verboseLogging` | false | Enable detailed probe logs |

## Files

| File | Purpose |
|------|---------|
| `src/probe/index.ts` | Public exports |
| `src/probe/types.ts` | Type definitions |
| `src/probe/fixtures/index.ts` | Minimal test fixtures |
| `src/probe/probe-client.ts` | HTTP client with timeout |
| `src/probe/provider-adapters.ts` | Provider-specific formatting |
| `src/probe/probes.ts` | Individual probe implementations |
| `src/probe/inference.ts` | Capability inference logic |
| `src/probe/cache.ts` | Cache with precedence chain |
| `src/probe/cli.ts` | Headless CLI entry point |
| `src/probe/quick-list-file.ts` | Shared quick list storage |

## Why Active Probing?

1. **Accuracy**: Discover actual capabilities, not documented ones
2. **Freshness**: Detect model updates automatically
3. **Coverage**: Handle custom/fine-tuned models with no documentation
4. **Resilience**: Graceful fallbacks when features are unavailable
5. **Minimal Cost**: Tiny fixtures keep probe costs negligible

## Future Enhancements

- **Streaming detection**: Probe for SSE vs non-streaming responses
- **Token counting**: Discover tokenizer compatibility
- **Rate limit detection**: Measure and respect provider limits
- **Batch probing**: Probe multiple models in parallel
- **Probe scheduling**: Background refresh of cached capabilities
