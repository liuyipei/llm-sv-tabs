<script lang="ts">
  /**
   * ArtifactInspector
   *
   * Main container for the artifact inspection workflow.
   * Allows users to view, regenerate, and select artifacts from the extraction pipeline.
   */
  import {
    currentPipeline,
    activeStage,
    compareMode,
    closeInspector,
    setActiveStage,
    toggleCompareMode,
  } from '$stores/pipeline';
  import type { PipelineStage } from '../../../types/pipeline';
  import { PIPELINE_STAGES } from '../../../types/pipeline';
  import StageNav from './StageNav.svelte';
  import StageViewer from './StageViewer.svelte';
  import SelectionPanel from './SelectionPanel.svelte';

  // Track current stage for highlighting
  let currentActiveStage = $state<PipelineStage>('capture');

  // Subscribe to store changes
  $effect(() => {
    const unsubscribe = activeStage.subscribe((stage) => {
      currentActiveStage = stage;
    });
    return unsubscribe;
  });

  function handleStageChange(stage: PipelineStage): void {
    setActiveStage(stage);
  }

  function handleClose(): void {
    closeInspector();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      handleClose();
    }
    // Arrow left/right to navigate stages
    if (event.key === 'ArrowLeft') {
      const currentIndex = PIPELINE_STAGES.indexOf(currentActiveStage);
      if (currentIndex > 0) {
        setActiveStage(PIPELINE_STAGES[currentIndex - 1]);
      }
    }
    if (event.key === 'ArrowRight') {
      const currentIndex = PIPELINE_STAGES.indexOf(currentActiveStage);
      if (currentIndex < PIPELINE_STAGES.length - 1) {
        setActiveStage(PIPELINE_STAGES[currentIndex + 1]);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $currentPipeline}
  <div class="inspector-overlay" role="presentation">
    <div class="inspector-container" role="dialog" aria-label="Artifact Inspector" aria-modal="true">
      <!-- Header -->
      <header class="inspector-header">
        <div class="header-info">
          <h2 class="inspector-title">{$currentPipeline.source_info.title}</h2>
          {#if $currentPipeline.source_info.url}
            <span class="inspector-url">{$currentPipeline.source_info.url}</span>
          {/if}
        </div>
        <div class="header-actions">
          <button
            class="action-button"
            class:active={$compareMode}
            onclick={() => toggleCompareMode()}
            title="Compare artifacts"
          >
            Compare
          </button>
          <button class="close-button" onclick={handleClose} title="Close inspector">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- Stage Navigation -->
      <StageNav
        stages={PIPELINE_STAGES}
        activeStage={currentActiveStage}
        pipeline={$currentPipeline}
        onStageChange={handleStageChange}
      />

      <!-- Main Content Area -->
      <div class="inspector-content">
        <div class="viewer-area">
          <StageViewer pipeline={$currentPipeline} stage={currentActiveStage} />
        </div>
        <aside class="selection-area">
          <SelectionPanel pipeline={$currentPipeline} />
        </aside>
      </div>

      <!-- Status Bar -->
      <footer class="inspector-footer">
        <div class="status-info">
          {#if $currentPipeline.status.state === 'running'}
            <span class="status-badge running">
              Running: {$currentPipeline.status.stage}
              {#if $currentPipeline.status.progress !== undefined}
                ({Math.round($currentPipeline.status.progress * 100)}%)
              {/if}
            </span>
          {:else if $currentPipeline.status.state === 'complete'}
            <span class="status-badge complete">Complete</span>
          {:else if $currentPipeline.status.state === 'error'}
            <span class="status-badge error" title={$currentPipeline.status.error}>
              Error in {$currentPipeline.status.stage}
            </span>
          {:else}
            <span class="status-badge idle">Ready</span>
          {/if}
        </div>
        <div class="keyboard-hints">
          <kbd>Esc</kbd> close
          <kbd>←</kbd><kbd>→</kbd> stages
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .inspector-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal, 1000);
  }

  .inspector-container {
    background-color: var(--bg-primary, #1a1a1a);
    border: 1px solid var(--border-color, #333);
    border-radius: var(--radius-lg, 12px);
    width: 95vw;
    height: 90vh;
    max-width: 1600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  .inspector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4, 16px) var(--space-6, 24px);
    border-bottom: 1px solid var(--border-color, #333);
    background-color: var(--bg-secondary, #242424);
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    min-width: 0;
  }

  .inspector-title {
    font-size: var(--text-lg, 18px);
    font-weight: 600;
    color: var(--text-primary, #fff);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inspector-url {
    font-size: var(--text-sm, 14px);
    color: var(--text-tertiary, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    display: flex;
    gap: var(--space-2, 8px);
    align-items: center;
  }

  .action-button {
    padding: var(--space-2, 8px) var(--space-4, 16px);
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

  .action-button.active {
    background-color: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: white;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    border-radius: var(--radius-md, 6px);
    color: var(--text-tertiary, #888);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-button:hover {
    background-color: var(--bg-hover, #333);
    color: var(--text-primary, #fff);
  }

  .inspector-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .viewer-area {
    flex: 1;
    overflow: auto;
    padding: var(--space-4, 16px);
  }

  .selection-area {
    width: 320px;
    border-left: 1px solid var(--border-color, #333);
    background-color: var(--bg-secondary, #242424);
    overflow-y: auto;
  }

  .inspector-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2, 8px) var(--space-6, 24px);
    border-top: 1px solid var(--border-color, #333);
    background-color: var(--bg-secondary, #242424);
  }

  .status-info {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    font-size: var(--text-xs, 12px);
    font-weight: 500;
    border-radius: var(--radius-sm, 4px);
  }

  .status-badge.idle {
    background-color: var(--bg-tertiary, #333);
    color: var(--text-secondary, #aaa);
  }

  .status-badge.running {
    background-color: var(--warning-bg, #332d00);
    color: var(--warning-color, #ffc107);
  }

  .status-badge.complete {
    background-color: var(--success-bg, #003322);
    color: var(--success-color, #4caf50);
  }

  .status-badge.error {
    background-color: var(--error-bg, #330000);
    color: var(--error-color, #f44336);
  }

  .keyboard-hints {
    display: flex;
    gap: var(--space-2, 8px);
    align-items: center;
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
  }

  .keyboard-hints kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 var(--space-1, 4px);
    background-color: var(--bg-tertiary, #333);
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-sm, 4px);
    font-family: inherit;
    font-size: var(--text-xs, 12px);
  }

  @media (max-width: 1024px) {
    .inspector-content {
      flex-direction: column;
    }

    .selection-area {
      width: 100%;
      border-left: none;
      border-top: 1px solid var(--border-color, #333);
      max-height: 200px;
    }
  }
</style>
