<script lang="ts">
  /**
   * StageNav
   *
   * Navigation tabs for switching between pipeline stages.
   * Shows artifact counts and status indicators for each stage.
   */
  import type { PipelineStage, SourcePipeline } from '../../../types/pipeline';

  type Props = {
    stages: readonly PipelineStage[];
    activeStage: PipelineStage;
    pipeline: SourcePipeline;
    onStageChange: (stage: PipelineStage) => void;
  };

  let { stages, activeStage, pipeline, onStageChange }: Props = $props();

  function getStageLabel(stage: PipelineStage): string {
    switch (stage) {
      case 'capture':
        return 'Capture';
      case 'render':
        return 'Render';
      case 'extract':
        return 'Extract';
      default:
        return stage;
    }
  }

  function getStageDescription(stage: PipelineStage): string {
    switch (stage) {
      case 'capture':
        return 'Original content preserved';
      case 'render':
        return 'Visual representation';
      case 'extract':
        return 'Derived text content';
      default:
        return '';
    }
  }

  function getStageIcon(stage: PipelineStage): string {
    switch (stage) {
      case 'capture':
        return '📥';
      case 'render':
        return '🖼️';
      case 'extract':
        return '📝';
      default:
        return '📄';
    }
  }

  function getArtifactCount(stage: PipelineStage): number {
    return pipeline.stages[stage].length;
  }

  function getSelectedCount(stage: PipelineStage): number {
    const artifacts = pipeline.stages[stage];
    return artifacts.filter((a) => pipeline.selection.artifact_ids.has(a.artifact_id)).length;
  }

  function isStageRunning(stage: PipelineStage): boolean {
    return pipeline.status.state === 'running' && pipeline.status.stage === stage;
  }

  function hasStageError(stage: PipelineStage): boolean {
    return pipeline.status.state === 'error' && pipeline.status.stage === stage;
  }
</script>

<nav class="stage-nav" role="tablist" aria-label="Pipeline stages">
  {#each stages as stage}
    {@const count = getArtifactCount(stage)}
    {@const selectedCount = getSelectedCount(stage)}
    {@const isRunning = isStageRunning(stage)}
    {@const hasError = hasStageError(stage)}
    <button
      class="stage-tab"
      class:active={activeStage === stage}
      class:running={isRunning}
      class:error={hasError}
      role="tab"
      aria-selected={activeStage === stage}
      aria-controls="stage-panel-{stage}"
      onclick={() => onStageChange(stage)}
    >
      <span class="stage-icon" aria-hidden="true">{getStageIcon(stage)}</span>
      <div class="stage-info">
        <span class="stage-label">{getStageLabel(stage)}</span>
        <span class="stage-description">{getStageDescription(stage)}</span>
      </div>
      <div class="stage-counts">
        {#if count > 0}
          <span class="artifact-count" title="{count} artifact{count !== 1 ? 's' : ''}">
            {count}
          </span>
          {#if selectedCount > 0}
            <span class="selected-count" title="{selectedCount} selected">
              {selectedCount} sel
            </span>
          {/if}
        {:else}
          <span class="artifact-count empty">0</span>
        {/if}
        {#if isRunning}
          <span class="running-indicator" aria-label="Running">
            <span class="spinner"></span>
          </span>
        {/if}
        {#if hasError}
          <span class="error-indicator" aria-label="Error">!</span>
        {/if}
      </div>
    </button>
  {/each}
</nav>

<style>
  .stage-nav {
    display: flex;
    border-bottom: 1px solid var(--border-color, #333);
    background-color: var(--bg-primary, #1a1a1a);
    padding: 0 var(--space-4, 16px);
  }

  .stage-tab {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px) var(--space-6, 24px);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    transition: all 0.15s ease;
    min-width: 0;
  }

  .stage-tab:hover {
    background-color: var(--bg-hover, rgba(255, 255, 255, 0.05));
    color: var(--text-primary, #fff);
  }

  .stage-tab.active {
    border-bottom-color: var(--accent-color, #0066cc);
    color: var(--text-primary, #fff);
  }

  .stage-tab.running {
    border-bottom-color: var(--warning-color, #ffc107);
  }

  .stage-tab.error {
    border-bottom-color: var(--error-color, #f44336);
  }

  .stage-icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .stage-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
  }

  .stage-label {
    font-weight: 600;
    font-size: var(--text-sm, 14px);
  }

  .stage-description {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
    white-space: nowrap;
  }

  .stage-counts {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    margin-left: auto;
  }

  .artifact-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 var(--space-2, 8px);
    background-color: var(--bg-tertiary, #333);
    border-radius: 12px;
    font-size: var(--text-xs, 12px);
    font-weight: 600;
  }

  .artifact-count.empty {
    opacity: 0.5;
  }

  .selected-count {
    font-size: var(--text-xs, 12px);
    color: var(--accent-color, #0066cc);
    font-weight: 500;
  }

  .running-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color, #444);
    border-top-color: var(--warning-color, #ffc107);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background-color: var(--error-color, #f44336);
    color: white;
    font-weight: bold;
    font-size: var(--text-xs, 12px);
    border-radius: 50%;
  }

  @media (max-width: 768px) {
    .stage-tab {
      flex-direction: column;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      gap: var(--space-1, 4px);
    }

    .stage-info {
      align-items: center;
    }

    .stage-description {
      display: none;
    }

    .stage-counts {
      margin-left: 0;
    }
  }
</style>
