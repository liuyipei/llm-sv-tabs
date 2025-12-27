# Context IR and Multimodal Protocol

**Status:** 🚧 In Progress (Phase 1 Complete)
**Location:** `src/main/services/context/`, `src/types/context-ir.ts`

---

## Overview

This document defines a **provider-agnostic intermediate representation (IR)** for multimodal context that enables:

- **Deterministic assembly**: Same inputs → same output structure
- **Provenance preservation**: Every piece of content is anchored and citable
- **Modality safety**: Graceful degradation across text-only, vision, and native-doc models
- **Token budgeting**: Content can shrink without losing intent or anchor references
- **Extensibility**: Provider-specific knobs are cleanly separated from the core IR

### Related Docs

- **[09-smart-content-extraction.md](./09-smart-content-extraction.md)**: Current content extraction (article vs app)
- **[11-pdf-content-extraction.md](./11-pdf-content-extraction.md)**: PDF text + page image extraction
- **[12-model-capability-probing.md](./12-model-capability-probing.md)**: Capability detection (vision, PDF, message shapes)
- **[01-token-streaming-and-providers.md](./01-token-streaming-and-providers.md)**: Provider architecture and streaming

---

## The Problem

The current system (`content-extractor.ts`, `query-handlers.ts`) extracts content and builds messages directly. This works but has limitations:

1. **No stable anchors**: Content isn't uniquely identified; citations can't reference specific sources
2. **Provider coupling**: Message building is interleaved with content extraction
3. **Lossy truncation**: When token budgets force cuts, context about what was cut is lost
4. **No provenance**: Models can't reliably cite "page 12 of document X"
5. **Inconsistent ordering**: Different code paths may order content differently

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Content Sources                                   │
│  Webpage │ PDF │ Image │ Note │ LLM Response │ Clipboard                │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     1. Source Registry                                   │
│                                                                          │
│  Each source gets a unique Source object with:                          │
│  • source_id (sha256 hash)                                              │
│  • source_type (webpage|pdf|image|note|chatlog)                         │
│  • metadata (title, url, captured_at)                                   │
│  • artifacts[] (text, images, pages)                                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     2. Context IR Builder                                │
│                                                                          │
│  Transforms Sources into a ContextEnvelope:                             │
│  • Context Index (always present, survives all truncation)              │
│  • Ranked chunks with anchor headers                                    │
│  • Attachment manifest                                                  │
│  • Modality annotations                                                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     3. Token Budget Manager                              │
│                                                                          │
│  Applies degrade ladder based on token limits:                          │
│  • Stage 0: Full content                                                │
│  • Stage 1: Remove low-ranked chunks (keep headers as "omitted")        │
│  • Stage 2: Summarize low-ranked sources (preserve anchors)             │
│  • Stage 3: Reduce attachments to top-K                                 │
│  • Stage 4: Hard truncate at semantic boundaries                        │
│  • Stage 5: Context Index only + Task                                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     4. Modality Router                                   │
│                                                                          │
│  Routes based on model capability class:                                │
│  • T0 (text-only): Text artifacts only                                  │
│  • V1 (vision): Text + images                                           │
│  • D1 (native-doc): Can receive PDFs directly                           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     5. Provider Adapter                                  │
│                                                                          │
│  Transforms ContextEnvelope → Provider-specific payload:                │
│  • OpenAI: content[] with input_text/input_image parts                  │
│  • Anthropic: content[] with text/image/document blocks                 │
│  • Gemini: parts[] with text/inlineData                                 │
│                                                                          │
│  Applies provider-specific preferences:                                 │
│  • Image ordering (before/after text)                                   │
│  • Base64 vs URL references                                             │
│  • Native PDF vs rasterized                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Types

### v1 Simplified Source (Recommended for Initial Implementation)

For v1, use a **discriminated union** that's simpler than the normalized Source/Artifact model.
This reduces complexity while still providing anchors and provenance:

```typescript
// src/types/context-ir.ts

type SourceId = `src:${string}`;  // 8-char hash

type Source =
  | WebpageSource
  | PdfSource
  | ImageSource
  | NoteSource
  | ChatlogSource;

interface BaseSource {
  source_id: SourceId;
  title: string;
  url?: string;
  captured_at: number;
  tab_id?: string;
}

interface WebpageSource extends BaseSource {
  kind: 'webpage';
  /** Extracted markdown content */
  markdown: string;
  /** Optional screenshot for vision models */
  screenshot?: BinaryBlob;
  /** Extraction method used */
  extraction_type: 'article' | 'app';
  quality: QualityHint;
}

interface PdfSource extends BaseSource {
  kind: 'pdf';
  /** Original PDF bytes (for native PDF support) */
  pdf_bytes?: BinaryBlob;
  /** Per-page content */
  pages: Array<{
    page_number: number;
    /** Extracted text */
    text?: string;
    /** Rendered page image */
    image?: BinaryBlob;
    quality?: QualityHint;
  }>;
}

interface ImageSource extends BaseSource {
  kind: 'image';
  /** The image data */
  image: BinaryBlob;
  /** Alt text or description (for text-only models) */
  alt_text?: string;
}

interface NoteSource extends BaseSource {
  kind: 'note';
  /** Plain text or markdown content */
  text: string;
}

interface ChatlogSource extends BaseSource {
  kind: 'chatlog';
  /** Messages in the conversation */
  messages: Array<{
    index: number;
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface BinaryBlob {
  data: string;        // base64
  mime_type: string;
  byte_size: number;
}
```

This flattened structure:
- Eliminates the Artifact indirection for v1
- Makes each source type self-describing
- Still supports anchors via `source_id` + location specifiers
- Can be evolved to the full Source/Artifact model in v2 if needed

---

### Full Source/Artifact Model (v2)

The normalized model below provides more flexibility for complex scenarios
(multiple extraction methods per source, caching individual artifacts, etc.).
**Consider this for v2.**

#### Source

A **Source** is the canonical representation of any content brought into context.

```typescript
// src/types/context-ir.ts

/**
 * Unique identifier for a source, derived from content hash.
 * Format: "src:<sha256-first-8-chars>"
 * Example: "src:9f3a7b2c"
 *
 * 8 hex chars = 4 billion combinations, sufficient for deduplication
 * while keeping anchors readable in prompts.
 */
export type SourceId = `src:${string}`;

/**
 * Anchor for citing specific locations within a source.
 * Format: "<source_id>#<location>"
 * Examples:
 *   "src:9f3a...#p=12"      - PDF page 12
 *   "src:1ab2...#sec=H2.3"  - Webpage section under 3rd H2
 *   "src:5cd6...#msg=5"     - Message 5 in a chat log
 */
export type Anchor = `${SourceId}#${string}` | SourceId;

export type SourceType = 'webpage' | 'pdf' | 'image' | 'note' | 'chatlog';

export interface Source {
  /** Stable hash-based identifier */
  source_id: SourceId;

  /** Type of content */
  source_type: SourceType;

  /** Human-readable title */
  title: string;

  /** Origin URL (if applicable) */
  url?: string;

  /** When this content was captured */
  captured_at: number;

  /** Original tab ID (ephemeral, for session reference) */
  tab_id?: string;

  /** Derived artifacts (text, images, pages) */
  artifacts: Artifact[];

  /** Source-specific metadata */
  metadata: SourceMetadata;
}

export interface SourceMetadata {
  /** For PDFs */
  page_count?: number;

  /** For webpages */
  extraction_type?: 'article' | 'app';

  /** Byte size of original content */
  byte_size?: number;

  /** MIME type */
  mime_type?: string;

  /** Extraction method used */
  extractor?: string;

  /** Extractor version */
  extractor_version?: string;

  /** Trust/safety hint */
  origin: 'user_upload' | 'web_capture' | 'generated' | 'clipboard';
}
```

### Artifact

An **Artifact** is a derived piece of content from a Source.

```typescript
export type ArtifactType =
  | 'text'           // Extracted text (markdown)
  | 'page_image'     // Rendered PDF page as PNG
  | 'screenshot'     // Full page screenshot
  | 'thumbnail'      // Resized preview image
  | 'raw_image'      // Original uploaded image
  | 'raw_pdf'        // Original PDF bytes (for native PDF support)
  | 'table_json';    // Structured table data

export type QualityHint = 'good' | 'mixed' | 'low' | 'ocr_like';

/**
 * Quality hint heuristics (computed during extraction):
 *
 * 'good':     - Text density > 50 chars per line average
 *             - < 5% non-ASCII characters
 *             - Recognizable word patterns
 *
 * 'mixed':    - Some garbled text or encoding issues
 *             - Inconsistent spacing/formatting
 *             - 5-20% non-ASCII characters
 *
 * 'low':      - Sparse text with lots of whitespace
 *             - > 20% non-ASCII or control characters
 *             - Very short average word length (< 3 chars)
 *
 * 'ocr_like': - Detected OCR patterns (single-char words, unusual spacing)
 *             - Common OCR errors (rn→m, l→1, O→0)
 *             - No embedded fonts in PDF source
 */

export interface Artifact {
  /** Hash of artifact content */
  artifact_id: string;

  /** Type of artifact */
  artifact_type: ArtifactType;

  /** Anchor for this specific artifact */
  anchor: Anchor;

  /** MIME type */
  mime_type: string;

  /** Size in bytes */
  byte_size: number;

  /** For page-based content: page number */
  page_number?: number;

  /** For sectioned content: section path */
  section_path?: string;

  /** Quality assessment (heuristic) */
  quality?: QualityHint;

  /** Image dimensions (if applicable) */
  dimensions?: { width: number; height: number };

  /** Transformation applied (e.g., "resize_512px", "render_dpi=150") */
  transform?: string;

  /** The actual content */
  content: TextArtifactContent | BinaryArtifactContent;
}

export interface TextArtifactContent {
  type: 'text';
  text: string;
  token_estimate?: number;
}

export interface BinaryArtifactContent {
  type: 'binary';
  /** Base64-encoded data */
  data: string;
  /** Data URL format: "data:<mime>;base64,<data>" */
  data_url: string;
}
```

### Context Envelope

The **ContextEnvelope** is the complete, provider-agnostic package ready for rendering.

```typescript
export interface ContextEnvelope {
  /** Version for format evolution */
  version: '1.0';

  /** When this envelope was created */
  created_at: number;

  /** All sources in this context */
  sources: Source[];

  /** The Context Index (always survives truncation) */
  index: ContextIndex;

  /** Ranked, formatted chunks ready for inclusion */
  chunks: ContextChunk[];

  /** Manifest of binary attachments */
  attachments: AttachmentManifest[];

  /** Token budget state */
  budget: TokenBudgetState;

  /** The user's task/query */
  task: string;
}

export interface ContextIndex {
  /** One entry per source */
  entries: ContextIndexEntry[];
}

export interface ContextIndexEntry {
  source_id: SourceId;
  title: string;
  url?: string;
  source_type: SourceType;
  /** For PDFs: which pages are attached */
  pages_attached?: number[];
  /** Brief summary (1-2 lines) */
  summary?: string;
  /** Whether full content is included */
  content_included: boolean;
}

export interface ContextChunk {
  /** Anchor for this chunk */
  anchor: Anchor;

  /** Source reference */
  source_id: SourceId;

  /** Source type (for rendering decisions) */
  source_type: SourceType;

  /** Title context */
  title: string;

  /** URL context */
  url?: string;

  /** How this content was extracted */
  extraction_method: string;

  /** Quality hint */
  quality?: QualityHint;

  /** The actual text content */
  content: string;

  /** Token count for this chunk */
  token_count: number;

  /** Relevance score (for ranking) */
  relevance_score?: number;

  /** Whether this chunk was truncated */
  truncated?: boolean;
}

export interface AttachmentManifest {
  anchor: Anchor;
  artifact_type: ArtifactType;
  mime_type: string;
  byte_size: number;
  dimensions?: { width: number; height: number };
  transform?: string;
  /** Whether this attachment is included in the current budget */
  included: boolean;
}

export interface TokenBudgetState {
  /** Maximum tokens allowed */
  max_tokens: number;
  /** Current token usage */
  used_tokens: number;
  /** Current degrade stage (0-5) */
  degrade_stage: number;
  /** What was cut */
  cuts: TokenBudgetCut[];
}

export interface TokenBudgetCut {
  type: 'chunk_removed' | 'chunk_truncated' | 'attachment_removed' | 'summarized';
  anchor: Anchor;
  original_tokens: number;
  reason: string;
}
```

---

## Anchor Format Specification

Anchors are the key to citation and provenance. They must be:

1. **Short**: Fit in prompts repeatedly without bloat
2. **Stable**: Same content → same anchor across retries
3. **Composable**: Support source → page → section hierarchy
4. **Parseable**: Machine-readable for downstream tools

### Format

```
<source_id>#<location_specifier>

Where:
  source_id    = "src:" + sha256(canonical_bytes)[0:8]
  location     = page | section | message | region

  page         = "p=" + page_number
  section      = "sec=" + heading_path
  message      = "msg=" + message_index
  region       = "r=" + x,y,w,h (for image regions)
```

### Examples

```
src:9f3a7b2c                    # Whole PDF document
src:9f3a7b2c#p=12               # Page 12 of PDF
src:1ab2cd3e#sec=H2.3           # 3rd section under 2nd H2
src:7890abcd#msg=5              # Message 5 in chat log
src:3456789a#r=100,200,300,400  # Region in image
```

### Cite Instruction

When sending context to models, include:

```
When referencing content from the attached sources, cite using the anchor format:
"According to src:9f3a...#p=12, ..."
```

---

## Modality Policy

### Capability Classes

Rather than provider names, we define capability classes:

| Class | Description | Image Support | PDF Support |
|-------|-------------|---------------|-------------|
| **T0** | Text-only | ❌ | Text extract only |
| **V1** | Vision-capable | ✅ Images | Rasterize to images |
| **D1** | Native document | ✅ Images | ✅ Native PDF |

### Routing Rules

```typescript
interface ModalityPolicy {
  forPdf(caps: CapabilityClass): 'native' | 'images' | 'text';
  forWebpage(caps: CapabilityClass): 'text' | 'text+screenshot';
  forImage(caps: CapabilityClass): 'image' | 'text_description' | 'omit';
}

const defaultPolicy: ModalityPolicy = {
  forPdf(caps) {
    if (caps === 'D1') return 'native';
    if (caps === 'V1') return 'images';
    return 'text';
  },

  forWebpage(caps) {
    // Always include text; optionally add screenshot for vision models
    return caps === 'V1' || caps === 'D1' ? 'text+screenshot' : 'text';
  },

  forImage(caps) {
    if (caps === 'V1' || caps === 'D1') return 'image';
    // For text-only, require alt-text or OCR
    return 'text_description';
  }
};
```

### PDF Fallback Ladder

```
1. supportsPdfNative: true  → Send PDF as document block
2. supportsVision: true     → Rasterize pages to PNG, send as images
3. default                  → Extract text, format with page markers
```

---

## Token Budgeting

### Degrade Ladder

The system applies increasingly aggressive truncation as token limits are reached:

| Stage | Strategy | What's Preserved |
|-------|----------|------------------|
| **0** | Full content | Everything |
| **1** | Remove low-ranked chunks | Chunk headers as "[omitted]" |
| **2** | Extractive summary of low-ranked sources | First 2-3 sentences + anchors |
| **3** | Reduce to top-K pages/chunks | Page list in index |
| **4** | Hard truncate at boundaries | Chunk headers with "[truncated]" |
| **5** | Minimal | Context Index + Task only |

### Invariant: Always Preserve

No matter how aggressive the truncation:

1. **Context Index** - The model always knows what exists
2. **Anchors** - Every remaining reference is citable
3. **Task** - The user's query is never truncated

### Extractive Summarization (Stage 2)

**v1 uses extractive summaries** - no LLM call required. This avoids circular dependencies
and keeps the pipeline deterministic.

Strategy:
1. Take first 2-3 sentences of the content (or first paragraph)
2. Append anchor references for remaining content
3. Mark as `[extractive summary]` so the model knows it's incomplete

```typescript
function extractiveSummary(chunk: ContextChunk): string {
  const sentences = chunk.content.split(/[.!?]+\s+/).slice(0, 3);
  const summary = sentences.join('. ').trim();

  return `${summary}... [extractive summary, see ${chunk.anchor} for full content]`;
}
```

Example output:
```
src:9f3a7b2c discusses Q3 financial results. Revenue increased 15% quarter-over-quarter.
The board approved a dividend increase... [extractive summary, see src:9f3a7b2c for full content]
```

**Note**: LLM-generated abstractive summaries could be added in v2 as an opt-in feature,
but v1 prioritizes determinism and speed.

---

## Rendering Format

### Text Output (Universal)

Every context envelope can be rendered to this text format:

```
=== CONTEXT INDEX ===
[1] src:9f3a7b2c | PDF | "Q3 Financial Report" | 24 pages | pages attached: [1,2,12,18]
[2] src:1ab2cd3e | webpage | "Product Pricing" | https://example.com/pricing | full content
[3] src:5678efgh | image | "Architecture Diagram" | included as attachment

=== CONTENT ===

[CHUNK]
anchor: src:9f3a7b2c#p=1
source_type: pdf
title: Q3 Financial Report
extraction: pdf_text_v1
quality: good
---
Executive Summary

Revenue increased 15% quarter-over-quarter...
[/CHUNK]

[CHUNK]
anchor: src:1ab2cd3e#sec=H1.1
source_type: webpage
title: Product Pricing
url: https://example.com/pricing
extraction: readability_v1
quality: good
---
## Enterprise Pricing

Contact sales for custom pricing...
[/CHUNK]

=== ATTACHMENTS ===
- anchor: src:9f3a7b2c#p=12 | kind: page_image | mime: image/png | 1275x1650
- anchor: src:5678efgh | kind: raw_image | mime: image/png | 800x600

=== TASK ===
Compare the revenue claims on src:9f3a7b2c#p=12 against the pricing shown in src:1ab2cd3e#sec=H1.1.
Quote exact numbers and cite anchors.
```

---

## Provider Adapters

### Adapter Interface

```typescript
interface ProviderAdapter {
  /** Provider identifier */
  provider: ProviderType;

  /** Render preferences (can be overridden per-model) */
  preferences: RenderPreferences;

  /** Transform ContextEnvelope → provider-specific messages */
  render(envelope: ContextEnvelope, caps: ProbedCapabilities): ProviderMessage[];
}

interface RenderPreferences {
  /** Order of content parts */
  contentOrder: 'text_first' | 'images_first' | 'interleaved';

  /** How to include images (v1: base64 only) */
  imageFormat: 'base64';  // 'url' | 'file_id' deferred to v2

  /** Maximum image dimension */
  maxImagePx: number;

  /** Use native PDF when available */
  preferNativePdf: boolean;
}

/**
 * v2 Scope: Provider File APIs
 *
 * Both OpenAI and Gemini support File APIs for reusing uploaded content:
 * - OpenAI: Files API with file_id references
 * - Gemini: Files API with URI references
 *
 * Benefits:
 * - Avoid re-uploading same content across requests
 * - Reduced request payload sizes
 * - Potential cost savings
 *
 * Implementation would add:
 * - FileUploadCache: Map<source_id, { provider, file_id, expires_at }>
 * - imageFormat: 'file_id' option
 * - Automatic upload on first use, reference on subsequent uses
 * - TTL management (OpenAI files expire, Gemini has storage limits)
 *
 * Deferred to v2 because:
 * - Base64 inline works for all providers
 * - File API semantics vary significantly between providers
 * - Adds complexity around cache invalidation and quota management
 */
```

### OpenAI Adapter

```typescript
const openaiAdapter: ProviderAdapter = {
  provider: 'openai',
  preferences: {
    contentOrder: 'text_first',  // OpenAI handles either, but text_first is clearer
    imageFormat: 'base64',       // data:image/png;base64,...
    maxImagePx: 2048,
    preferNativePdf: false       // OpenAI doesn't support native PDF
  },

  render(envelope, caps) {
    const parts: ContentPart[] = [];

    // Render text context
    parts.push({
      type: 'input_text',
      text: renderContextText(envelope)
    });

    // Add images if vision-capable
    if (caps.supportsVision) {
      for (const attachment of envelope.attachments.filter(a => a.included)) {
        const artifact = findArtifact(envelope, attachment.anchor);
        if (artifact?.content.type === 'binary') {
          parts.push({
            type: 'input_image',
            image_url: artifact.content.data_url
          });
        }
      }
    }

    return [{ role: 'user', content: parts }];
  }
};
```

### Anthropic Adapter

```typescript
const anthropicAdapter: ProviderAdapter = {
  provider: 'anthropic',
  preferences: {
    contentOrder: 'interleaved',  // Anthropic works well with interleaved
    imageFormat: 'base64',
    maxImagePx: 1568,             // Anthropic's recommended max
    preferNativePdf: true         // Claude supports native PDF
  },

  render(envelope, caps) {
    const content: ContentBlock[] = [];

    // For PDFs with native support, send as document
    if (caps.supportsPdfNative) {
      for (const source of envelope.sources.filter(s => s.source_type === 'pdf')) {
        const pdfArtifact = source.artifacts.find(a => a.artifact_type === 'raw_pdf');
        if (pdfArtifact?.content.type === 'binary') {
          content.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfArtifact.content.data
            }
          });
        }
      }
    }

    // Add text context
    content.push({
      type: 'text',
      text: renderContextText(envelope)
    });

    // Add images
    if (caps.supportsVision) {
      for (const attachment of envelope.attachments.filter(a => a.included)) {
        // ... similar to OpenAI
      }
    }

    return [{ role: 'user', content }];
  }
};
```

### Gemini Adapter

```typescript
const geminiAdapter: ProviderAdapter = {
  provider: 'gemini',
  preferences: {
    contentOrder: 'images_first',  // Gemini examples commonly show this
    imageFormat: 'base64',
    maxImagePx: 3072,
    preferNativePdf: true          // Gemini supports PDF via Files API
  },

  render(envelope, caps) {
    const parts: Part[] = [];

    // Images first for Gemini
    if (caps.supportsVision) {
      for (const attachment of envelope.attachments.filter(a => a.included)) {
        const artifact = findArtifact(envelope, attachment.anchor);
        if (artifact?.content.type === 'binary') {
          parts.push({
            inlineData: {
              mimeType: attachment.mime_type,
              data: artifact.content.data
            }
          });
        }
      }
    }

    // Then text
    parts.push({
      text: renderContextText(envelope)
    });

    return [{ role: 'user', parts }];
  }
};
```

---

## Integration with Existing System

### Migration Path

The new Context IR system layers on top of existing code:

```
Current Flow:
  Tab → ContentExtractor → ExtractedContent → query-handlers → Provider

New Flow:
  Tab → ContentExtractor → ExtractedContent
                               ↓
                         SourceBuilder ──→ Source[]
                               ↓
                         ContextIRBuilder ──→ ContextEnvelope
                               ↓
                         TokenBudgetManager ──→ ContextEnvelope (trimmed)
                               ↓
                         ModalityRouter ──→ ContextEnvelope (filtered)
                               ↓
                         ProviderAdapter ──→ Messages[]
                               ↓
                         Provider.queryStream()
```

### Backward Compatibility

The `ExtractedContent` type remains as the extraction output. New code transforms it:

```typescript
// src/main/services/context/source-builder.ts

function buildSource(extracted: ExtractedContent, tabInfo: ContextTabInfo): Source {
  const sourceId = computeSourceId(extracted);

  return {
    source_id: sourceId,
    source_type: mapTabTypeToSourceType(tabInfo.type),
    title: extracted.title,
    url: extracted.url,
    captured_at: Date.now(),
    tab_id: tabInfo.id,
    artifacts: buildArtifacts(extracted, sourceId),
    metadata: {
      extraction_type: extracted.metadata?.extractionType,
      byte_size: estimateByteSize(extracted),
      extractor: 'smart-content-extractor',
      extractor_version: '1.0',
      origin: 'web_capture'
    }
  };
}

function computeSourceId(extracted: ExtractedContent): SourceId {
  const canonical = JSON.stringify({
    url: extracted.url,
    content: typeof extracted.content === 'string'
      ? extracted.content
      : JSON.stringify(extracted.content)
  });
  const hash = sha256(canonical).substring(0, 8);  // 8 chars = 4B combinations
  return `src:${hash}`;
}
```

---

## Metadata for Idempotence and Debugging

### What to Track

| Category | Fields | Purpose |
|----------|--------|---------|
| **Identity** | `source_id`, `artifact_id`, `byte_size`, `mime_type` | Cache keys, deduplication |
| **Provenance** | `title`, `url`, `captured_at`, `tab_id` | Debugging, user reference |
| **Extraction** | `extractor`, `extractor_version`, `transform` | Reproducibility |
| **Safety** | `origin`, `pii_risk_hint`, `contains_credentials_hint` | Trust decisions |

### Idempotence

Same content → same `source_id`:

```typescript
// Cache lookup before extraction
const existingSource = sourceCache.get(computeSourceId(content));
if (existingSource && existingSource.captured_at > Date.now() - CACHE_TTL) {
  return existingSource;
}
```

---

## File Structure

```
src/
├── types/
│   └── context-ir.ts           # Type definitions
├── main/services/context/
│   ├── index.ts                # Public exports
│   ├── source-builder.ts       # ExtractedContent → Source
│   ├── context-ir-builder.ts   # Source[] → ContextEnvelope
│   ├── token-budget.ts         # Degrade ladder implementation
│   ├── modality-router.ts      # Capability-based filtering
│   ├── anchor-utils.ts         # Anchor parsing/generation
│   └── adapters/
│       ├── base-adapter.ts     # Adapter interface
│       ├── openai-adapter.ts
│       ├── anthropic-adapter.ts
│       └── gemini-adapter.ts
└── tests/
    └── context-ir/
        ├── source-builder.test.ts
        ├── context-ir-builder.test.ts
        ├── token-budget.test.ts
        └── adapters.test.ts
```

---

## Testing Strategy

### Unit Tests

- **Source building**: Verify `source_id` stability, artifact extraction
- **Anchor generation**: Test all anchor formats, parsing
- **Token budgeting**: Each degrade stage, boundary cases
- **Adapter rendering**: Provider-specific output formats

### Integration Tests

- **Round-trip**: Tab → Source → Envelope → Render → Verify structure
- **Capability routing**: Test T0/V1/D1 paths
- **Truncation scenarios**: Large documents, many tabs

### Fixture-Based Tests

Use real-world samples:

```typescript
const FIXTURES = {
  simpleWebpage: 'fixtures/simple-article.html',
  complexPdf: 'fixtures/multi-page-report.pdf',
  mixedContext: 'fixtures/mixed-tabs-scenario.json'
};
```

---

## Implementation Phases

### v1 Scope (Simplified, Deterministic)

#### Phase 1: Core Types and Source Building ✅
- Define v1 discriminated union types in `context-ir.ts`
- Implement `source-builder.ts` (ExtractedContent → Source)
- Add anchor utilities (8-char hashes, location parsing)
- Quality hint heuristics
- Tests for source/anchor generation

**Implemented files:**
- `src/types/context-ir.ts` - Core type definitions
- `src/main/services/context/anchor-utils.ts` - Source ID and anchor utilities
- `src/main/services/context/quality-hints.ts` - Text quality assessment
- `src/main/services/context/source-builder.ts` - ExtractedContent → Source conversion
- `src/main/services/context/index.ts` - Public exports
- `tests/context-ir/*.test.ts` - 69 tests covering all Phase 1 functionality

#### Phase 2: Context Envelope and Rendering
- Implement `context-ir-builder.ts` (Source[] → ContextEnvelope)
- Text rendering format (Context Index + Chunks + Attachments)
- Integration with existing `query-handlers.ts`
- Tests for envelope building

#### Phase 3: Token Budgeting
- Implement 5-stage degrade ladder in `token-budget.ts`
- Extractive summarization (no LLM calls)
- Semantic boundary detection (headings, paragraphs, page breaks)
- Tests for all degrade stages

#### Phase 4: Provider Adapters
- OpenAI adapter (text + base64 images)
- Anthropic adapter (text + base64 images + native PDF)
- Gemini adapter (images-first ordering)
- Wire into existing provider flow

---

### v2 Scope (Enhanced, Opt-in Complexity)

#### Phase 5: Advanced Source Model
- Full Source/Artifact normalization (if needed)
- Multiple extraction methods per source
- Artifact-level caching

#### Phase 6: Provider File APIs
- OpenAI Files API integration
- Gemini Files API integration
- FileUploadCache with TTL management
- `imageFormat: 'file_id'` support

#### Phase 7: LLM-Assisted Features
- Abstractive summarization (opt-in)
- Relevance ranking via embeddings
- Query-aware chunk selection

#### Phase 8: Safety and Trust
- PII detection hints
- Credential detection
- Origin-based trust levels

---

## Summary

This design introduces a **provider-agnostic Context IR** that:

1. **Anchors everything** with stable, citable identifiers (8-char hashes)
2. **Preserves provenance** through extraction metadata
3. **Degrades gracefully** with a 5-stage degrade ladder
4. **Stays deterministic** - v1 uses extractive summaries, no LLM calls in the pipeline
5. **Separates concerns** between content representation and provider formatting
6. **Enables citations** that survive summarization and truncation

### v1 Design Principles

- **Simplicity over flexibility**: Discriminated union Source type, not normalized artifacts
- **Determinism over intelligence**: Extractive summaries, not LLM-generated
- **Inline over external**: Base64 images, not File API references
- **Incremental adoption**: Layers on existing `ExtractedContent` without breaking it

### Key Insight

**The model should always know what context exists, even if it can't see all of it.**

The Context Index and anchor system make this possible - even at Stage 5 (maximum truncation),
the model sees a complete index of sources and can request more detail if needed.
