<script lang="ts">
  /**
   * StageViewer
   *
   * Displays all artifacts for a specific pipeline stage.
   * Supports grid and list views, with previews and metadata.
   */
  import type {
    PipelineStage,
    SourcePipeline,
    PipelineArtifact,
    CaptureArtifact,
    RenderArtifact,
    ExtractArtifact,
  } from '../../../types/pipeline';
  import { toggleArtifactSelection } from '$stores/pipeline';
  import ArtifactCard from './ArtifactCard.svelte';

  type Props = {
    pipeline: SourcePipeline;
    stage: PipelineStage;
  };

  let { pipeline, stage }: Props = $props();

  type ViewMode = 'grid' | 'list';
  let viewMode = $state<ViewMode>('grid');

  $effect(() => {
    // Derived artifacts for current stage
  });

  function getArtifacts(): PipelineArtifact[] {
    return pipeline.stages[stage] as PipelineArtifact[];
  }

  function isSelected(artifactId: string): boolean {
    return pipeline.selection.artifact_ids.has(artifactId);
  }

  function handleToggleSelection(artifactId: string): void {
    toggleArtifactSelection(pipeline.source_id, artifactId);
  }

  function getEmptyStateMessage(): string {
    switch (stage) {
      case 'capture':
        return 'No captures yet. The original content will appear here once captured.';
      case 'render':
        return 'No rendered artifacts. Use the regenerate action to create visual representations.';
      case 'extract':
        return 'No extracted text. Use the regenerate action to extract text from captured content.';
      default:
        return 'No artifacts in this stage.';
    }
  }

  function getStageActionLabel(): string {
    switch (stage) {
      case 'capture':
        return 'Capture Now';
      case 'render':
        return 'Render Pages';
      case 'extract':
        return 'Extract Text';
      default:
        return 'Run Stage';
    }
  }
</script>

<div
  class="stage-viewer"
  id="stage-panel-{stage}"
  role="tabpanel"
  aria-labelledby="stage-tab-{stage}"
>
  <!-- Toolbar -->
  <div class="viewer-toolbar">
    <div class="toolbar-left">
      <span class="artifact-summary">
        {getArtifacts().length} artifact{getArtifacts().length !== 1 ? 's' : ''}
      </span>
    </div>
    <div class="toolbar-right">
      <div class="view-toggle" role="group" aria-label="View mode">
        <button
          class="toggle-button"
          class:active={viewMode === 'grid'}
          onclick={() => (viewMode = 'grid')}
          aria-pressed={viewMode === 'grid'}
          title="Grid view"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </button>
        <button
          class="toggle-button"
          class:active={viewMode === 'list'}
          onclick={() => (viewMode = 'list')}
          aria-pressed={viewMode === 'list'}
          title="List view"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </button>
      </div>
      <button class="action-button regenerate" title="Regenerate this stage">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        {getStageActionLabel()}
      </button>
    </div>
  </div>

  <!-- Content Area -->
  {#if getArtifacts().length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        {#if stage === 'capture'}
          📥
        {:else if stage === 'render'}
          🖼️
        {:else}
          📝
        {/if}
      </div>
      <p class="empty-message">{getEmptyStateMessage()}</p>
      <button class="action-button primary">
        {getStageActionLabel()}
      </button>
    </div>
  {:else}
    <div class="artifacts-container" class:grid={viewMode === 'grid'} class:list={viewMode === 'list'}>
      {#each getArtifacts() as artifact (artifact.artifact_id)}
        <ArtifactCard
          {artifact}
          selected={isSelected(artifact.artifact_id)}
          {viewMode}
          onToggleSelect={() => handleToggleSelection(artifact.artifact_id)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .stage-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .viewer-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3, 12px) 0;
    margin-bottom: var(--space-3, 12px);
    border-bottom: 1px solid var(--border-color, #333);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }

  .artifact-summary {
    font-size: var(--text-sm, 14px);
    color: var(--text-secondary, #aaa);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }

  .view-toggle {
    display: flex;
    background-color: var(--bg-tertiary, #333);
    border-radius: var(--radius-md, 6px);
    padding: 2px;
  }

  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
    background: none;
    border: none;
    border-radius: var(--radius-sm, 4px);
    color: var(--text-tertiary, #666);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-button:hover {
    color: var(--text-secondary, #aaa);
  }

  .toggle-button.active {
    background-color: var(--bg-primary, #1a1a1a);
    color: var(--text-primary, #fff);
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background-color: var(--bg-tertiary, #333);
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-md, 6px);
    color: var(--text-secondary, #ccc);
    font-size: var(--text-sm, 14px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-button:hover {
    background-color: var(--bg-hover, #3a3a3a);
    color: var(--text-primary, #fff);
  }

  .action-button.primary {
    background-color: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: white;
  }

  .action-button.primary:hover {
    background-color: var(--accent-hover, #0055aa);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4, 16px);
    padding: var(--space-10, 40px);
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .empty-message {
    max-width: 300px;
    font-size: var(--text-sm, 14px);
    color: var(--text-tertiary, #666);
    line-height: 1.5;
    margin: 0;
  }

  .artifacts-container {
    flex: 1;
    overflow-y: auto;
    padding-bottom: var(--space-4, 16px);
  }

  .artifacts-container.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4, 16px);
  }

  .artifacts-container.list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }
</style>
