/**
 * Experiment Store
 *
 * Manages state for the content normalization experiment.
 */

import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import type {
  SourcePipeline,
  SourceId,
  PipelineStage,
  PipelineArtifact,
  ExperimentConfig,
  ExperimentTab,
  SourceInput,
  RenderArtifact,
  ExtractArtifact,
  CaptureArtifact,
  Anchor,
} from '../types';
import { createEmptyPipeline, createArtifactId, PIPELINE_STAGES } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const defaultConfig: ExperimentConfig = {
  defaultDpi: 150,
  defaultImageFormat: 'png',
};

export const config: Writable<ExperimentConfig> = writable(defaultConfig);

// ============================================================================
// UI State
// ============================================================================

/** Current active tab */
export const activeTab: Writable<ExperimentTab> = writable('upload');

/** Currently selected pipeline */
export const selectedPipelineId: Writable<SourceId | null> = writable(null);

/** Currently selected stage */
export const selectedStage: Writable<PipelineStage> = writable('capture');

/** Selected artifacts for comparison */
export const compareArtifacts: Writable<string[]> = writable([]);

/** Whether comparison mode is active */
export const isComparing: Writable<boolean> = writable(false);

/** Loading state */
export const isLoading: Writable<boolean> = writable(false);

/** Error message */
export const errorMessage: Writable<string | null> = writable(null);

/** Log messages */
export const logMessages: Writable<Array<{ time: Date; level: string; message: string }>> = writable([]);

// ============================================================================
// Pipeline State
// ============================================================================

/** All pipelines in the experiment */
export const pipelines: Writable<Map<SourceId, SourcePipeline>> = writable(new Map());

/** Source file data (File objects, ArrayBuffers, or strings) */
export const sourceFiles: Writable<Map<SourceId, File | ArrayBuffer | string>> = writable(new Map());

/** Counter for generating source IDs */
let sourceCounter = 0;

/**
 * Generate a new source ID
 */
function generateSourceId(): SourceId {
  const hash = (++sourceCounter).toString(16).padStart(8, '0');
  return `src:${hash}` as SourceId;
}

/**
 * Log a message
 */
export function log(level: 'info' | 'warn' | 'error', message: string): void {
  logMessages.update((msgs) => [
    ...msgs.slice(-99), // Keep last 100 messages
    { time: new Date(), level, message },
  ]);
}

/**
 * Create a new pipeline from source input
 */
export function createPipelineFromInput(input: SourceInput): SourceId {
  const sourceId = generateSourceId();

  const sourceInfo = {
    title: input.name,
    url: input.url,
    type: input.type === 'pdf' ? 'pdf' as const :
          input.type === 'image' ? 'image' as const :
          input.type === 'url' ? 'webpage' as const : 'note' as const,
  };

  const pipeline = createEmptyPipeline(sourceId, sourceInfo);

  pipelines.update((map) => {
    const newMap = new Map(map);
    newMap.set(sourceId, pipeline);
    return newMap;
  });

  // Store the source file data for later conversion
  sourceFiles.update((map) => {
    const newMap = new Map(map);
    newMap.set(sourceId, input.data);
    return newMap;
  });

  log('info', `Created pipeline for "${input.name}" (${sourceId})`);

  // Auto-select the new pipeline
  selectedPipelineId.set(sourceId);
  activeTab.set('pipeline');

  return sourceId;
}

/**
 * Get source file for a pipeline
 */
export function getSourceFile(sourceId: SourceId): File | ArrayBuffer | string | undefined {
  return get(sourceFiles).get(sourceId);
}

/**
 * Remove a pipeline
 */
export function removePipeline(sourceId: SourceId): void {
  pipelines.update((map) => {
    const newMap = new Map(map);
    newMap.delete(sourceId);
    return newMap;
  });

  selectedPipelineId.update((id) => (id === sourceId ? null : id));
  log('info', `Removed pipeline ${sourceId}`);
}

/**
 * Add an artifact to a pipeline
 */
export function addArtifact(sourceId: SourceId, artifact: PipelineArtifact): void {
  pipelines.update((map) => {
    const pipeline = map.get(sourceId);
    if (!pipeline) {
      log('error', `Pipeline not found: ${sourceId}`);
      return map;
    }

    const stage = artifact.stage;
    const newStages = {
      ...pipeline.stages,
      [stage]: [...pipeline.stages[stage], artifact],
    };

    const newPipeline: SourcePipeline = {
      ...pipeline,
      stages: newStages,
      updated_at: Date.now(),
    };

    const newMap = new Map(map);
    newMap.set(sourceId, newPipeline);
    return newMap;
  });

  log('info', `Added ${artifact.stage} artifact to ${sourceId}`);
}

/**
 * Update pipeline status
 */
export function updatePipelineStatus(
  sourceId: SourceId,
  status: SourcePipeline['status']
): void {
  pipelines.update((map) => {
    const pipeline = map.get(sourceId);
    if (!pipeline) return map;

    const newMap = new Map(map);
    newMap.set(sourceId, {
      ...pipeline,
      status,
      updated_at: Date.now(),
    });
    return newMap;
  });
}

/**
 * Toggle artifact selection
 */
export function toggleArtifactSelection(sourceId: SourceId, artifactId: string): void {
  pipelines.update((map) => {
    const pipeline = map.get(sourceId);
    if (!pipeline) return map;

    const newArtifactIds = new Set(pipeline.selection.artifact_ids);
    if (newArtifactIds.has(artifactId)) {
      newArtifactIds.delete(artifactId);
    } else {
      newArtifactIds.add(artifactId);
    }

    const newMap = new Map(map);
    newMap.set(sourceId, {
      ...pipeline,
      selection: {
        ...pipeline.selection,
        artifact_ids: newArtifactIds,
        mode: 'manual',
        modified_at: Date.now(),
      },
      updated_at: Date.now(),
    });
    return newMap;
  });
}

// ============================================================================
// Derived Stores
// ============================================================================

/** Current pipeline */
export const currentPipeline: Readable<SourcePipeline | null> = derived(
  [pipelines, selectedPipelineId],
  ([$pipelines, $selectedPipelineId]) => {
    if (!$selectedPipelineId) return null;
    return $pipelines.get($selectedPipelineId) ?? null;
  }
);

/** Artifacts for current stage */
export const currentStageArtifacts: Readable<PipelineArtifact[]> = derived(
  [currentPipeline, selectedStage],
  ([$currentPipeline, $selectedStage]) => {
    if (!$currentPipeline) return [];
    return $currentPipeline.stages[$selectedStage] as PipelineArtifact[];
  }
);

/** All pipeline IDs */
export const pipelineIds: Readable<SourceId[]> = derived(pipelines, ($pipelines) => {
  return Array.from($pipelines.keys());
});

/** Pipeline count */
export const pipelineCount: Readable<number> = derived(pipelines, ($pipelines) => {
  return $pipelines.size;
});

/** Total selected artifacts across all pipelines */
export const totalSelectedArtifacts: Readable<number> = derived(pipelines, ($pipelines) => {
  let total = 0;
  for (const pipeline of $pipelines.values()) {
    total += pipeline.selection.artifact_ids.size;
  }
  return total;
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all pipelines
 */
export function clearAllPipelines(): void {
  pipelines.set(new Map());
  selectedPipelineId.set(null);
  log('info', 'Cleared all pipelines');
}

/**
 * Find artifact by ID in any pipeline
 */
export function findArtifactGlobal(artifactId: string): {
  pipeline: SourcePipeline;
  artifact: PipelineArtifact;
} | null {
  let result: { pipeline: SourcePipeline; artifact: PipelineArtifact } | null = null;

  pipelines.subscribe(($pipelines) => {
    for (const pipeline of $pipelines.values()) {
      for (const stage of PIPELINE_STAGES) {
        const artifact = pipeline.stages[stage].find((a) => a.artifact_id === artifactId);
        if (artifact) {
          result = { pipeline, artifact };
          return;
        }
      }
    }
  })();

  return result;
}

/**
 * Add artifact to comparison
 */
export function addToComparison(artifactId: string): void {
  compareArtifacts.update((list) => {
    if (list.includes(artifactId)) return list;
    if (list.length >= 2) {
      return [list[1], artifactId];
    }
    return [...list, artifactId];
  });
  isComparing.set(true);
}

/**
 * Clear comparison
 */
export function clearComparison(): void {
  compareArtifacts.set([]);
  isComparing.set(false);
}
