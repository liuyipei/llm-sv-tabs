# Content Normalization and UI Experimentation (Phase 3 Re-scope)

**Status:** 🚧 In Progress
**Location:** `src/main/services/pipeline/`, `src/ui/components/artifacts/`, `src/types/pipeline.ts`

---

## Overview

This document describes the **Phase 3 re-scope** from token budgeting and truncation toward **content normalization and UI experimentation**. The goal is to build robust, inspectable extraction pipelines for heterogeneous sources (webpages, PDFs, images) with a UI that supports artifact inspection, regeneration, and selection.

### Related Docs

- **[18-context-ir-and-multimodal-protocol.md](./18-context-ir-and-multimodal-protocol.md)**: Context IR foundation (Phase 1 & 2)
- **[09-smart-content-extraction.md](./09-smart-content-extraction.md)**: Current text extraction
- **[11-pdf-content-extraction.md](./11-pdf-content-extraction.md)**: PDF extraction pipeline

---

## Motivation

### Why we pivoted

Phase 3 originally focused on token budgeting, truncation ladders, and downstream rendering optimizations. This over-indexed on text-first extraction minutia and is not aligned with the most uncertain/high-leverage part of the product.

### New objectives

1. **Content normalization across heterogeneous sources** with robust, inspectable artifacts
2. **Rendering-truth pipelines** for webpages:
   - `webpage → pdf → image` (stable "reading view" / pagination)
   - `webpage → image` (screen truth / what the user saw)
3. **Text as derived and inspectable**, not canonical:
   - `image → text` (vision/OCR extraction as intermediate, user-visible artifact)
4. **Stable provenance + anchors** so every derived artifact remains citable and traceable

---

## Architecture

### Staged Pipeline Model

Content extraction becomes a **staged pipeline** whose intermediate artifacts are visible, editable/selectable, and reproducible.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Original Source                                   │
│  (webpage URL, PDF file, uploaded image, note text)                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Stage 1: Capture                                     │
│                                                                          │
│  • Webpage: Full page screenshot, DOM snapshot                          │
│  • PDF: Original bytes preserved                                        │
│  • Image: Original image preserved                                      │
│  • Note: Original text preserved                                        │
│                                                                          │
│  Artifact: CaptureArtifact { type, data, captured_at, source_anchor }  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Stage 2: Render / Normalize                          │
│                                                                          │
│  • Webpage → PDF: Print to PDF (stable pagination)                      │
│  • Webpage → Images: Screenshot per viewport scroll                     │
│  • PDF → Images: Rasterize each page                                    │
│  • Image → (preserved)                                                  │
│                                                                          │
│  Artifact: RenderArtifact { pages[], format, dpi, source_anchor }      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Stage 3: Extract Text                                │
│                                                                          │
│  • PDF → Text: pdf.js text layer                                        │
│  • Image → Text: Vision/OCR extraction                                  │
│  • Rendered PDF → Text: pdf.js on rendered PDF                          │
│  • Webpage → Text: Readability/DOM walker                               │
│                                                                          │
│  Artifact: TextArtifact { text, method, quality_hint, source_anchor }  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     UI: Inspect / Regenerate / Select                    │
│                                                                          │
│  • View each stage artifact side-by-side                                │
│  • Re-run any stage with different options                              │
│  • Select which artifacts enter model context                           │
│  • See provenance chain (what produced this?)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Types

### Pipeline Artifact (base)

```typescript
// src/types/pipeline.ts

/**
 * A single artifact in the staged extraction pipeline.
 * Every artifact tracks its provenance back to the original source.
 */
export interface PipelineArtifact {
  /** Unique ID for this artifact instance */
  artifact_id: string;

  /** The stage that produced this artifact */
  stage: PipelineStage;

  /** Anchor to the source (maintains Context IR compatibility) */
  source_anchor: Anchor;

  /** When this artifact was created */
  created_at: number;

  /** What produced this artifact */
  provenance: ArtifactProvenance;

  /** Current selection state for context inclusion */
  selected: boolean;
}

export type PipelineStage = 'capture' | 'render' | 'extract';

export interface ArtifactProvenance {
  /** Method/tool used to create this artifact */
  method: string;
  /** Version of the method */
  version: string;
  /** Parent artifact IDs (empty for capture stage) */
  parent_ids: string[];
  /** Configuration used */
  config?: Record<string, unknown>;
}
```

### Stage-Specific Artifacts

```typescript
/**
 * Capture stage: Original content preserved
 */
export interface CaptureArtifact extends PipelineArtifact {
  stage: 'capture';
  capture_type: 'screenshot' | 'dom_snapshot' | 'pdf_bytes' | 'image_bytes' | 'text';
  data: BinaryBlob | string;
  /** Source URL or identifier */
  source_uri: string;
  /** Original dimensions (for images/screenshots) */
  dimensions?: { width: number; height: number };
}

/**
 * Render stage: Normalized visual representation
 */
export interface RenderArtifact extends PipelineArtifact {
  stage: 'render';
  render_type: 'pdf_pages' | 'scrolling_screenshots' | 'rasterized_pages';
  /** Individual rendered pages/frames */
  pages: RenderedPage[];
  /** Rendering configuration */
  render_config: RenderConfig;
}

export interface RenderedPage {
  /** Page/frame number (1-indexed) */
  page_number: number;
  /** The rendered image */
  image: BinaryBlob;
  /** Page-specific anchor */
  anchor: Anchor;
  /** Dimensions in pixels */
  dimensions: { width: number; height: number };
}

export interface RenderConfig {
  /** For PDF rasterization */
  dpi?: number;
  /** For screenshots */
  viewport_width?: number;
  viewport_height?: number;
  /** Format */
  format: 'png' | 'jpeg' | 'webp';
}

/**
 * Extract stage: Derived text content
 */
export interface ExtractArtifact extends PipelineArtifact {
  stage: 'extract';
  extract_type: 'text_layer' | 'ocr' | 'vision' | 'readability' | 'dom_walker';
  /** Extracted text (markdown or plain) */
  text: string;
  /** Quality assessment */
  quality: QualityHint;
  /** Token estimate */
  token_estimate: number;
  /** Per-page text (for multi-page sources) */
  page_texts?: PageText[];
}

export interface PageText {
  page_number: number;
  text: string;
  quality: QualityHint;
  anchor: Anchor;
}
```

### Pipeline Container

```typescript
/**
 * Complete pipeline for a single source.
 * Contains all artifacts across all stages.
 */
export interface SourcePipeline {
  /** Source ID (from Context IR) */
  source_id: SourceId;

  /** Source metadata */
  source_info: {
    title: string;
    url?: string;
    type: SourceKind;
    tab_id?: string;
  };

  /** All artifacts, organized by stage */
  stages: {
    capture: CaptureArtifact[];
    render: RenderArtifact[];
    extract: ExtractArtifact[];
  };

  /** Currently selected artifacts for context */
  selection: ArtifactSelection;

  /** Pipeline status */
  status: PipelineStatus;
}

export interface ArtifactSelection {
  /** Selected artifact IDs */
  artifact_ids: Set<string>;
  /** Selected page numbers (for multi-page sources) */
  pages?: number[];
  /** Selection mode */
  mode: 'auto' | 'manual';
}

export type PipelineStatus =
  | { state: 'idle' }
  | { state: 'running'; stage: PipelineStage; progress?: number }
  | { state: 'complete' }
  | { state: 'error'; stage: PipelineStage; error: string };
```

---

## UI Components

### Component Hierarchy

```
ArtifactInspector (main container)
├── PipelineHeader (source info, status)
├── StageNav (stage tabs: Capture | Render | Extract)
├── StageViewer (displays artifacts for current stage)
│   ├── ArtifactCard (individual artifact with preview)
│   │   ├── ArtifactPreview (image/text preview)
│   │   ├── ArtifactMetadata (provenance, quality)
│   │   └── ArtifactActions (select, regenerate, compare)
│   └── CompareView (side-by-side artifact comparison)
├── SelectionPanel (what goes into context)
│   ├── SelectionSummary (token counts, page counts)
│   └── SelectionList (selected artifacts with ordering)
└── ProvenanceTree (visual provenance chain)
```

### ArtifactInspector

The main container component that orchestrates the inspection workflow.

```svelte
<!-- src/ui/components/artifacts/ArtifactInspector.svelte -->
<script lang="ts">
  import type { SourcePipeline, PipelineStage } from '../../../types/pipeline';

  let { pipeline, onSelectionChange } = $props<{
    pipeline: SourcePipeline;
    onSelectionChange?: (selection: ArtifactSelection) => void;
  }>();

  let activeStage = $state<PipelineStage>('capture');
  let compareMode = $state(false);
</script>
```

### StageViewer

Displays artifacts for a given stage with preview and metadata.

### SelectionPanel

Shows what's currently selected for context inclusion, with token budgets.

---

## Store Design

### Pipeline Store

```typescript
// src/ui/stores/pipeline.ts

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { SourcePipeline, SourceId, ArtifactSelection } from '../../types/pipeline';

/** All pipelines, keyed by source_id */
export const pipelines: Writable<Map<SourceId, SourcePipeline>> = writable(new Map());

/** Currently inspected pipeline */
export const inspectedSourceId: Writable<SourceId | null> = writable(null);

/** Derived: Current pipeline being inspected */
export const currentPipeline: Readable<SourcePipeline | null> = derived(
  [pipelines, inspectedSourceId],
  ([$pipelines, $inspectedSourceId]) => {
    if (!$inspectedSourceId) return null;
    return $pipelines.get($inspectedSourceId) ?? null;
  }
);

/** Derived: All selections across pipelines (for context building) */
export const allSelections: Readable<Map<SourceId, ArtifactSelection>> = derived(
  pipelines,
  ($pipelines) => {
    const selections = new Map<SourceId, ArtifactSelection>();
    for (const [id, pipeline] of $pipelines) {
      selections.set(id, pipeline.selection);
    }
    return selections;
  }
);

// Actions
export function updatePipeline(sourceId: SourceId, updates: Partial<SourcePipeline>): void { ... }
export function updateSelection(sourceId: SourceId, selection: ArtifactSelection): void { ... }
export function regenerateStage(sourceId: SourceId, stage: PipelineStage): Promise<void> { ... }
```

---

## Regeneration Service

### IPC Handlers

```typescript
// src/main/ipc/handlers/pipeline-handlers.ts

/** Regenerate a specific stage with optional config overrides */
ipcMain.handle('pipeline:regenerate-stage', async (_, {
  sourceId,
  stage,
  config
}: {
  sourceId: SourceId;
  stage: PipelineStage;
  config?: Record<string, unknown>;
}): Promise<PipelineArtifact[]> => {
  // Get the source pipeline
  // Re-run the specified stage
  // Return new artifacts
});

/** Get available regeneration options for a stage */
ipcMain.handle('pipeline:get-stage-options', async (_, {
  sourceId,
  stage
}: {
  sourceId: SourceId;
  stage: PipelineStage;
}): Promise<StageOptions> => {
  // Return available methods, configs, etc.
});
```

---

## Integration with Context IR

The pipeline system extends the existing Context IR rather than replacing it:

```typescript
// Building context from pipeline selections
function buildContextFromPipelines(
  pipelines: Map<SourceId, SourcePipeline>
): ContextEnvelope {
  const sources: Source[] = [];
  const chunks: ContextChunk[] = [];
  const attachments: AttachmentManifest[] = [];

  for (const [sourceId, pipeline] of pipelines) {
    // Get selected artifacts
    const selected = getSelectedArtifacts(pipeline);

    // Build Source from pipeline
    const source = buildSourceFromPipeline(pipeline, selected);
    sources.push(source);

    // Build chunks from selected extract artifacts
    for (const artifact of selected.filter(a => a.stage === 'extract')) {
      chunks.push(buildChunkFromExtract(artifact as ExtractArtifact));
    }

    // Build attachment manifest from selected render artifacts
    for (const artifact of selected.filter(a => a.stage === 'render')) {
      attachments.push(...buildAttachmentsFromRender(artifact as RenderArtifact));
    }
  }

  return {
    version: '1.0',
    created_at: Date.now(),
    sources,
    index: buildIndex(sources),
    chunks,
    attachments,
    budget: { max_tokens: 0, used_tokens: 0, degrade_stage: 0, cuts: [] },
    task: ''
  };
}
```

---

## Testing Strategy

### Unit Tests

- Pipeline artifact creation and provenance tracking
- Stage regeneration with different configs
- Selection state management
- Context building from selections

### Component Tests

- ArtifactInspector renders all stages correctly
- StageViewer shows artifacts with previews
- SelectionPanel updates selections
- ProvenanceTree displays lineage correctly

### Integration Tests

- Full pipeline: webpage → capture → render → extract
- Regeneration preserves parent relationships
- Context IR compatibility with pipeline selections

---

## Implementation Phases

### Phase 3a: Core Types and Store (Current)
- Define pipeline types in `src/types/pipeline.ts`
- Create pipeline store in `src/ui/stores/pipeline.ts`
- Basic artifact ID generation and provenance tracking

### Phase 3b: UI Components
- ArtifactInspector container
- StageViewer for each stage type
- ArtifactCard with preview and metadata
- SelectionPanel for context selection

### Phase 3c: Regeneration Service
- IPC handlers for stage regeneration
- Multiple extraction method support
- Comparison view for regenerated artifacts

### Phase 3d: Integration
- Wire pipeline to existing query flow
- Update ContextIRBuilder to use pipeline selections
- Migrate existing extraction to pipeline model

---

## What We're NOT Doing (Deferred)

- **Token budgeting and degrade ladder**: Dropped from Phase 3
- **Semantic truncation**: Dropped from Phase 3
- **Ranking heuristics**: Dropped from Phase 3
- **Abstractive summarization**: Remains v2 scope

---

## Summary

This Phase 3 re-scope shifts focus from token budgeting to:

1. **Staged extraction pipelines** with visible intermediate artifacts
2. **UI-first experimentation** for context management workflow
3. **Rendering-truth capture** (webpage → PDF → image, webpage → image)
4. **Text as derived artifact** with provenance and quality hints
5. **User control** over what enters model context

The goal is to build confidence in the normalization pipeline through UI iteration before committing to default behaviors.
