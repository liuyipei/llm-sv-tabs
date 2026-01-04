<script lang="ts">
  import {
    currentPipeline,
    selectedStage,
    currentStageArtifacts,
    toggleArtifactSelection,
    removePipeline,
    log,
  } from '$lib/stores/experiment';
  import { PIPELINE_STAGES, type PipelineStage, type PipelineArtifact, type BinaryBlob } from '$lib/types';

  import StagePanel from './StagePanel.svelte';

  function getStageLabel(stage: PipelineStage): string {
    return stage.charAt(0).toUpperCase() + stage.slice(1);
  }

  function getStageIcon(stage: PipelineStage): string {
    switch (stage) {
      case 'capture': return '📥';
      case 'render': return '🖼️';
      case 'extract': return '📝';
      default: return '📄';
    }
  }

  function getArtifactCount(stage: PipelineStage): number {
    if (!$currentPipeline) return 0;
    return $currentPipeline.stages[stage].length;
  }

  function handleDeletePipeline(): void {
    if (!$currentPipeline) return;
    if (confirm(`Delete pipeline "${$currentPipeline.source_info.title}"?`)) {
      removePipeline($currentPipeline.source_id);
    }
  }
</script>

<div class="pipeline-view">
  {#if !$currentPipeline}
    <div class="empty-state">
      <span class="empty-icon">📋</span>
      <h2>No Pipeline Selected</h2>
      <p>Select a pipeline from the sidebar or upload a new source.</p>
    </div>
  {:else}
    <!-- Pipeline Header -->
    <header class="pipeline-header">
      <div class="header-info">
        <h2 class="pipeline-title">{$currentPipeline.source_info.title}</h2>
        {#if $currentPipeline.source_info.url}
          <a href={$currentPipeline.source_info.url} class="pipeline-url" target="_blank" rel="noopener">
            {$currentPipeline.source_info.url}
          </a>
        {/if}
        <div class="pipeline-meta">
          <span class="meta-item">
            <span class="meta-label">Type:</span>
            {$currentPipeline.source_info.type}
          </span>
          <span class="meta-item">
            <span class="meta-label">Status:</span>
            {$currentPipeline.status.state}
          </span>
          <span class="meta-item">
            <span class="meta-label">ID:</span>
            <code>{$currentPipeline.source_id}</code>
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button class="action-btn" onclick={() => log('info', 'Re-run pipeline')}>
          ↻ Re-run
        </button>
        <button class="action-btn danger" onclick={handleDeletePipeline}>
          🗑️ Delete
        </button>
      </div>
    </header>

    <!-- Stage Tabs -->
    <nav class="stage-tabs">
      {#each PIPELINE_STAGES as stage}
        <button
          class="stage-tab"
          class:active={$selectedStage === stage}
          onclick={() => selectedStage.set(stage)}
        >
          <span class="tab-icon">{getStageIcon(stage)}</span>
          <span class="tab-label">{getStageLabel(stage)}</span>
          <span class="tab-count">{getArtifactCount(stage)}</span>
        </button>
      {/each}
    </nav>

    <!-- Pipeline Diagram -->
    <div class="pipeline-diagram">
      {#each PIPELINE_STAGES as stage, i}
        <div class="stage-node" class:active={$selectedStage === stage}>
          <span class="node-icon">{getStageIcon(stage)}</span>
          <span class="node-label">{getStageLabel(stage)}</span>
          <span class="node-count">{getArtifactCount(stage)}</span>
        </div>
        {#if i < PIPELINE_STAGES.length - 1}
          <div class="stage-arrow">→</div>
        {/if}
      {/each}
    </div>

    <!-- Stage Content -->
    <div class="stage-content">
      <StagePanel
        pipeline={$currentPipeline}
        stage={$selectedStage}
        artifacts={$currentStageArtifacts}
        onToggleSelect={(id) => toggleArtifactSelection($currentPipeline.source_id, id)}
      />
    </div>
  {/if}
</div>

<style>
  .pipeline-view {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: var(--space-4);
    opacity: 0.5;
  }

  .empty-state h2 {
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .empty-state p {
    margin: 0;
  }

  .pipeline-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-6);
  }

  .header-info {
    flex: 1;
  }

  .pipeline-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-1);
  }

  .pipeline-url {
    font-size: 0.875rem;
    color: var(--accent-color);
    text-decoration: none;
  }

  .pipeline-url:hover {
    text-decoration: underline;
  }

  .pipeline-meta {
    display: flex;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  .meta-item {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .meta-label {
    color: var(--text-secondary);
  }

  .meta-item code {
    font-family: var(--font-mono);
    background-color: var(--bg-tertiary);
    padding: 2px 4px;
    border-radius: var(--radius-sm);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .action-btn {
    padding: var(--space-2) var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background-color: var(--bg-secondary);
    color: var(--text-primary);
  }

  .action-btn.danger:hover {
    background-color: var(--error-color);
    border-color: var(--error-color);
    color: white;
  }

  .stage-tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
    background-color: var(--bg-secondary);
    padding: var(--space-1);
    border-radius: var(--radius-lg);
  }

  .stage-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .stage-tab:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .stage-tab.active {
    background-color: var(--accent-color);
    color: white;
  }

  .tab-icon {
    font-size: 1rem;
  }

  .tab-count {
    padding: 2px 8px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    font-size: 0.75rem;
  }

  .pipeline-diagram {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
  }

  .stage-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background-color: var(--bg-tertiary);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-md);
    transition: all 0.15s;
  }

  .stage-node.active {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
  }

  .node-icon {
    font-size: 1.5rem;
  }

  .node-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .node-count {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .stage-arrow {
    font-size: 1.5rem;
    color: var(--text-tertiary);
  }

  .stage-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
