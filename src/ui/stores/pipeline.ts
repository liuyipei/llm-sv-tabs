/**
 * Pipeline Store
 *
 * Manages staged extraction pipelines for content normalization.
 * Each source has a pipeline with capture, render, and extract stages.
 *
 * See docs/design/19-content-normalization-ui.md for full design.
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type {
  SourcePipeline,
  ArtifactSelection,
  PipelineStage,
  PipelineArtifact,
  PipelineStatus,
  SourceInfo,
} from '../../types/pipeline';
import { createEmptyPipeline, createEmptySelection, PIPELINE_STAGES } from '../../types/pipeline';
import type { SourceId } from '../../types/context-ir';

// ============================================================================
// Core Stores
// ============================================================================

/**
 * All pipelines, keyed by source_id
 */
export const pipelines: Writable<Map<SourceId, SourcePipeline>> = writable(new Map());

/**
 * Currently inspected pipeline (null if inspector is closed)
 */
export const inspectedSourceId: Writable<SourceId | null> = writable(null);

/**
 * Currently active stage in the inspector
 */
export const activeStage: Writable<PipelineStage> = writable('capture');

/**
 * Whether compare mode is enabled in the inspector
 */
export const compareMode: Writable<boolean> = writable(false);

/**
 * Artifacts selected for comparison (max 2)
 */
export const compareArtifacts: Writable<[string, string] | null> = writable(null);

// ============================================================================
// Derived Stores
// ============================================================================

/**
 * Current pipeline being inspected
 */
export const currentPipeline: Readable<SourcePipeline | null> = derived(
  [pipelines, inspectedSourceId],
  ([$pipelines, $inspectedSourceId]) => {
    if (!$inspectedSourceId) return null;
    return $pipelines.get($inspectedSourceId) ?? null;
  }
);

/**
 * Artifacts for the current stage of the inspected pipeline
 */
export const currentStageArtifacts: Readable<PipelineArtifact[]> = derived(
  [currentPipeline, activeStage],
  ([$currentPipeline, $activeStage]) => {
    if (!$currentPipeline) return [];
    return $currentPipeline.stages[$activeStage] as PipelineArtifact[];
  }
);

/**
 * All selections across all pipelines (for context building)
 */
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

/**
 * Total estimated tokens across all selected artifacts
 */
export const totalSelectedTokens: Readable<number> = derived(allSelections, ($allSelections) => {
  let total = 0;
  for (const selection of $allSelections.values()) {
    total += selection.estimated_tokens;
  }
  return total;
});

/**
 * Count of pipelines by status
 */
export const pipelineStatusCounts: Readable<Record<PipelineStatus['state'], number>> = derived(
  pipelines,
  ($pipelines) => {
    const counts: Record<PipelineStatus['state'], number> = {
      idle: 0,
      running: 0,
      complete: 0,
      error: 0,
    };
    for (const pipeline of $pipelines.values()) {
      counts[pipeline.status.state]++;
    }
    return counts;
  }
);

/**
 * List of all pipeline source IDs in creation order
 */
export const pipelineIds: Readable<SourceId[]> = derived(pipelines, ($pipelines) => {
  return Array.from($pipelines.entries())
    .sort((a, b) => a[1].created_at - b[1].created_at)
    .map(([id]) => id);
});

// ============================================================================
// Pipeline CRUD Operations
// ============================================================================

/**
 * Create a new pipeline for a source
 */
export function createPipeline(sourceId: SourceId, sourceInfo: SourceInfo): void {
  pipelines.update(($pipelines) => {
    if ($pipelines.has(sourceId)) {
      console.warn('[PIPELINE] Pipeline already exists for source:', sourceId);
      return $pipelines;
    }
    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, createEmptyPipeline(sourceId, sourceInfo));
    return newPipelines;
  });
}

/**
 * Remove a pipeline
 */
export function removePipeline(sourceId: SourceId): void {
  pipelines.update(($pipelines) => {
    if (!$pipelines.has(sourceId)) {
      return $pipelines;
    }
    const newPipelines = new Map($pipelines);
    newPipelines.delete(sourceId);
    return newPipelines;
  });

  // Clear inspection if this pipeline was being inspected
  inspectedSourceId.update(($id) => ($id === sourceId ? null : $id));
}

/**
 * Update a pipeline with partial updates
 */
export function updatePipeline(sourceId: SourceId, updates: Partial<SourcePipeline>): void {
  pipelines.update(($pipelines) => {
    const existing = $pipelines.get(sourceId);
    if (!existing) {
      console.error('[PIPELINE] Pipeline not found:', sourceId);
      return $pipelines;
    }

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...existing,
      ...updates,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

/**
 * Get a pipeline by ID (synchronous, reads current state)
 */
export function getPipeline(sourceId: SourceId): SourcePipeline | undefined {
  let result: SourcePipeline | undefined;
  pipelines.subscribe(($pipelines) => {
    result = $pipelines.get(sourceId);
  })();
  return result;
}

// ============================================================================
// Artifact Operations
// ============================================================================

/**
 * Add an artifact to a pipeline
 */
export function addArtifact(sourceId: SourceId, artifact: PipelineArtifact): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      console.error('[PIPELINE] Pipeline not found for artifact:', sourceId);
      return $pipelines;
    }

    const stage = artifact.stage;
    const newStages = {
      ...pipeline.stages,
      [stage]: [...pipeline.stages[stage], artifact],
    };

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

/**
 * Remove an artifact from a pipeline
 */
export function removeArtifact(sourceId: SourceId, artifactId: string): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      return $pipelines;
    }

    // Find and remove the artifact from the appropriate stage
    const newStages = { ...pipeline.stages };
    for (const stage of PIPELINE_STAGES) {
      const artifacts = pipeline.stages[stage];
      const index = artifacts.findIndex((a) => a.artifact_id === artifactId);
      if (index !== -1) {
        newStages[stage] = [...artifacts.slice(0, index), ...artifacts.slice(index + 1)];
        break;
      }
    }

    // Also remove from selection
    const newSelection = { ...pipeline.selection };
    if (newSelection.artifact_ids.has(artifactId)) {
      newSelection.artifact_ids = new Set(newSelection.artifact_ids);
      newSelection.artifact_ids.delete(artifactId);
      newSelection.modified_at = Date.now();
    }

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      selection: newSelection,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

/**
 * Update an artifact's properties
 */
export function updateArtifact(
  sourceId: SourceId,
  artifactId: string,
  updates: Partial<PipelineArtifact>
): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      return $pipelines;
    }

    const newStages = { ...pipeline.stages };
    let found = false;

    for (const stage of PIPELINE_STAGES) {
      const artifacts = pipeline.stages[stage];
      const index = artifacts.findIndex((a) => a.artifact_id === artifactId);
      if (index !== -1) {
        const updatedArtifact = { ...artifacts[index], ...updates };
        newStages[stage] = [...artifacts.slice(0, index), updatedArtifact, ...artifacts.slice(index + 1)];
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn('[PIPELINE] Artifact not found:', artifactId);
      return $pipelines;
    }

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

// ============================================================================
// Selection Operations
// ============================================================================

/**
 * Update selection for a pipeline
 */
export function updateSelection(sourceId: SourceId, selection: ArtifactSelection): void {
  updatePipeline(sourceId, { selection });
}

/**
 * Toggle selection for a specific artifact
 */
export function toggleArtifactSelection(sourceId: SourceId, artifactId: string): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      return $pipelines;
    }

    const newArtifactIds = new Set(pipeline.selection.artifact_ids);
    if (newArtifactIds.has(artifactId)) {
      newArtifactIds.delete(artifactId);
    } else {
      newArtifactIds.add(artifactId);
    }

    // Recalculate token estimate (simplified - would need actual artifact data)
    const estimatedTokens = calculateSelectionTokens(pipeline, newArtifactIds);

    const newSelection: ArtifactSelection = {
      ...pipeline.selection,
      artifact_ids: newArtifactIds,
      mode: 'manual',
      estimated_tokens: estimatedTokens,
      modified_at: Date.now(),
    };

    // Also update the artifact's selected property
    const newStages = { ...pipeline.stages };
    for (const stage of PIPELINE_STAGES) {
      newStages[stage] = pipeline.stages[stage].map((a) =>
        a.artifact_id === artifactId ? { ...a, selected: newArtifactIds.has(artifactId) } : a
      );
    }

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      selection: newSelection,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

/**
 * Select all artifacts in a stage
 */
export function selectAllInStage(sourceId: SourceId, stage: PipelineStage): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      return $pipelines;
    }

    const stageArtifacts = pipeline.stages[stage];
    const newArtifactIds = new Set(pipeline.selection.artifact_ids);
    for (const artifact of stageArtifacts) {
      newArtifactIds.add(artifact.artifact_id);
    }

    const estimatedTokens = calculateSelectionTokens(pipeline, newArtifactIds);

    const newSelection: ArtifactSelection = {
      ...pipeline.selection,
      artifact_ids: newArtifactIds,
      mode: 'manual',
      estimated_tokens: estimatedTokens,
      modified_at: Date.now(),
    };

    const newStages = { ...pipeline.stages };
    newStages[stage] = stageArtifacts.map((a) => ({ ...a, selected: true }));

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      selection: newSelection,
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

/**
 * Clear all selections for a pipeline
 */
export function clearSelection(sourceId: SourceId): void {
  pipelines.update(($pipelines) => {
    const pipeline = $pipelines.get(sourceId);
    if (!pipeline) {
      return $pipelines;
    }

    const newStages = { ...pipeline.stages };
    for (const stage of PIPELINE_STAGES) {
      newStages[stage] = pipeline.stages[stage].map((a) => ({ ...a, selected: false }));
    }

    const newPipelines = new Map($pipelines);
    newPipelines.set(sourceId, {
      ...pipeline,
      stages: newStages,
      selection: createEmptySelection(),
      updated_at: Date.now(),
    });
    return newPipelines;
  });
}

// ============================================================================
// Status Operations
// ============================================================================

/**
 * Update pipeline status
 */
export function updatePipelineStatus(sourceId: SourceId, status: PipelineStatus): void {
  updatePipeline(sourceId, { status });
}

/**
 * Set pipeline to running state
 */
export function setPipelineRunning(
  sourceId: SourceId,
  stage: PipelineStage,
  progress?: number,
  message?: string
): void {
  updatePipelineStatus(sourceId, { state: 'running', stage, progress, message });
}

/**
 * Set pipeline to complete state
 */
export function setPipelineComplete(sourceId: SourceId): void {
  updatePipelineStatus(sourceId, { state: 'complete', completed_at: Date.now() });
}

/**
 * Set pipeline to error state
 */
export function setPipelineError(
  sourceId: SourceId,
  stage: PipelineStage,
  error: string,
  recoverable = true
): void {
  updatePipelineStatus(sourceId, { state: 'error', stage, error, recoverable });
}

// ============================================================================
// Inspector Operations
// ============================================================================

/**
 * Open the inspector for a pipeline
 */
export function openInspector(sourceId: SourceId): void {
  inspectedSourceId.set(sourceId);
  activeStage.set('capture');
  compareMode.set(false);
  compareArtifacts.set(null);
}

/**
 * Close the inspector
 */
export function closeInspector(): void {
  inspectedSourceId.set(null);
  compareMode.set(false);
  compareArtifacts.set(null);
}

/**
 * Set the active stage in the inspector
 */
export function setActiveStage(stage: PipelineStage): void {
  activeStage.set(stage);
  compareArtifacts.set(null);
}

/**
 * Toggle compare mode
 */
export function toggleCompareMode(): void {
  compareMode.update((mode) => {
    if (mode) {
      compareArtifacts.set(null);
    }
    return !mode;
  });
}

/**
 * Add artifact to comparison (max 2)
 */
export function addToComparison(artifactId: string): void {
  compareArtifacts.update((current) => {
    if (!current) {
      return [artifactId, artifactId] as [string, string];
    }
    if (current[0] === artifactId || current[1] === artifactId) {
      return current;
    }
    return [current[1], artifactId] as [string, string];
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate estimated tokens for a selection
 */
function calculateSelectionTokens(
  pipeline: SourcePipeline,
  selectedIds: Set<string>
): number {
  let total = 0;
  for (const stage of PIPELINE_STAGES) {
    for (const artifact of pipeline.stages[stage]) {
      if (selectedIds.has(artifact.artifact_id)) {
        // Only extract artifacts contribute tokens
        if (artifact.stage === 'extract') {
          total += (artifact as { token_estimate?: number }).token_estimate ?? 0;
        }
      }
    }
  }
  return total;
}

/**
 * Get all selected artifacts from a pipeline
 */
export function getSelectedArtifacts(pipeline: SourcePipeline): PipelineArtifact[] {
  const selected: PipelineArtifact[] = [];
  for (const stage of PIPELINE_STAGES) {
    for (const artifact of pipeline.stages[stage]) {
      if (pipeline.selection.artifact_ids.has(artifact.artifact_id)) {
        selected.push(artifact);
      }
    }
  }
  return selected;
}

/**
 * Find an artifact by ID across all stages
 */
export function findArtifact(
  pipeline: SourcePipeline,
  artifactId: string
): PipelineArtifact | undefined {
  for (const stage of PIPELINE_STAGES) {
    const artifact = pipeline.stages[stage].find((a) => a.artifact_id === artifactId);
    if (artifact) return artifact;
  }
  return undefined;
}

/**
 * Get the latest artifact of each stage
 */
export function getLatestArtifacts(
  pipeline: SourcePipeline
): Partial<Record<PipelineStage, PipelineArtifact>> {
  const result: Partial<Record<PipelineStage, PipelineArtifact>> = {};
  for (const stage of PIPELINE_STAGES) {
    const artifacts = pipeline.stages[stage];
    if (artifacts.length > 0) {
      // Sort by created_at descending and get first
      const sorted = [...artifacts].sort((a, b) => b.created_at - a.created_at);
      result[stage] = sorted[0];
    }
  }
  return result;
}
