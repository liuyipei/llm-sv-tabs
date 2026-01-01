<script lang="ts">
  /**
   * SelectionPanel
   *
   * Shows selected artifacts and their contribution to context.
   * Displays token counts, page selection, and allows reordering.
   */
  import type { SourcePipeline, PipelineArtifact, ExtractArtifact } from '../../../types/pipeline';
  import { clearSelection, getSelectedArtifacts, findArtifact } from '$stores/pipeline';
  import { PIPELINE_STAGES } from '../../../types/pipeline';

  type Props = {
    pipeline: SourcePipeline;
  };

  let { pipeline }: Props = $props();

  function getSelectedByStage(): Map<string, PipelineArtifact[]> {
    const byStage = new Map<string, PipelineArtifact[]>();
    for (const stage of PIPELINE_STAGES) {
      byStage.set(stage, []);
    }

    for (const artifactId of pipeline.selection.artifact_ids) {
      const artifact = findArtifact(pipeline, artifactId);
      if (artifact) {
        const list = byStage.get(artifact.stage) || [];
        list.push(artifact);
        byStage.set(artifact.stage, list);
      }
    }

    return byStage;
  }

  function getArtifactSummary(artifact: PipelineArtifact): string {
    switch (artifact.stage) {
      case 'capture':
        return `${(artifact as { capture_type: string }).capture_type}`;
      case 'render':
        return `${(artifact as { page_count: number }).page_count} pages`;
      case 'extract':
        return `~${(artifact as ExtractArtifact).token_estimate.toLocaleString()} tokens`;
      default:
        return '';
    }
  }

  function getStageLabel(stage: string): string {
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

  function handleClearAll(): void {
    clearSelection(pipeline.source_id);
  }

  const selectedByStage = $derived(getSelectedByStage());
  const totalSelected = $derived(pipeline.selection.artifact_ids.size);
  const totalTokens = $derived(pipeline.selection.estimated_tokens);
</script>

<div class="selection-panel">
  <header class="panel-header">
    <h3 class="panel-title">Context Selection</h3>
    {#if totalSelected > 0}
      <button class="clear-button" onclick={handleClearAll}>Clear All</button>
    {/if}
  </header>

  <div class="selection-summary">
    <div class="summary-row">
      <span class="summary-label">Selected</span>
      <span class="summary-value">{totalSelected} artifact{totalSelected !== 1 ? 's' : ''}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Est. Tokens</span>
      <span class="summary-value tokens">{totalTokens.toLocaleString()}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Mode</span>
      <span class="summary-value mode" class:manual={pipeline.selection.mode === 'manual'}>
        {pipeline.selection.mode}
      </span>
    </div>
  </div>

  {#if totalSelected === 0}
    <div class="empty-selection">
      <div class="empty-icon">📋</div>
      <p class="empty-text">No artifacts selected</p>
      <p class="empty-hint">Select artifacts from the stages to include them in the model context.</p>
    </div>
  {:else}
    <div class="selection-list">
      {#each PIPELINE_STAGES as stage}
        {@const artifacts = selectedByStage.get(stage) || []}
        {#if artifacts.length > 0}
          <div class="stage-group">
            <div class="stage-header">
              <span class="stage-icon">
                {#if stage === 'capture'}
                  📥
                {:else if stage === 'render'}
                  🖼️
                {:else}
                  📝
                {/if}
              </span>
              <span class="stage-name">{getStageLabel(stage)}</span>
              <span class="stage-count">{artifacts.length}</span>
            </div>
            <ul class="artifact-list">
              {#each artifacts as artifact (artifact.artifact_id)}
                <li class="artifact-item">
                  <span class="artifact-info">
                    <span class="artifact-method">{artifact.provenance.method}</span>
                    <span class="artifact-summary">{getArtifactSummary(artifact)}</span>
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Context Preview Toggle -->
  <div class="preview-section">
    <button class="preview-button">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      Preview Context
    </button>
  </div>

  <!-- Provenance Chain -->
  {#if totalSelected > 0}
    <div class="provenance-section">
      <h4 class="section-title">Provenance Chain</h4>
      <div class="provenance-chain">
        <div class="chain-step">
          <div class="step-dot source"></div>
          <span class="step-label">Source</span>
        </div>
        <div class="chain-line"></div>
        {#each PIPELINE_STAGES as stage, i}
          {@const artifacts = selectedByStage.get(stage) || []}
          {#if artifacts.length > 0}
            <div class="chain-step">
              <div class="step-dot {stage}"></div>
              <span class="step-label">{getStageLabel(stage)}</span>
            </div>
            {#if i < PIPELINE_STAGES.length - 1}
              <div class="chain-line"></div>
            {/if}
          {/if}
        {/each}
        <div class="chain-line"></div>
        <div class="chain-step">
          <div class="step-dot context"></div>
          <span class="step-label">Context</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .selection-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4, 16px);
    border-bottom: 1px solid var(--border-color, #333);
  }

  .panel-title {
    font-size: var(--text-sm, 14px);
    font-weight: 600;
    color: var(--text-primary, #fff);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .clear-button {
    padding: var(--space-1, 4px) var(--space-2, 8px);
    background: none;
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-sm, 4px);
    color: var(--text-tertiary, #888);
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-button:hover {
    border-color: var(--error-color, #f44336);
    color: var(--error-color, #f44336);
  }

  .selection-summary {
    padding: var(--space-4, 16px);
    background-color: var(--bg-tertiary, rgba(0, 0, 0, 0.2));
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .summary-label {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-value {
    font-size: var(--text-sm, 14px);
    color: var(--text-secondary, #ccc);
    font-weight: 500;
  }

  .summary-value.tokens {
    font-family: var(--font-mono, monospace);
    color: var(--accent-color, #0066cc);
  }

  .summary-value.mode {
    text-transform: capitalize;
    padding: 2px 6px;
    background-color: var(--bg-primary, #1a1a1a);
    border-radius: var(--radius-sm, 4px);
  }

  .summary-value.mode.manual {
    color: var(--warning-color, #ffc107);
  }

  .empty-selection {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8, 32px) var(--space-4, 16px);
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.5;
    margin-bottom: var(--space-2, 8px);
  }

  .empty-text {
    font-size: var(--text-sm, 14px);
    color: var(--text-secondary, #aaa);
    margin: 0 0 var(--space-1, 4px);
  }

  .empty-hint {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
    margin: 0;
    max-width: 200px;
  }

  .selection-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px);
  }

  .stage-group {
    margin-bottom: var(--space-4, 16px);
  }

  .stage-group:last-child {
    margin-bottom: 0;
  }

  .stage-header {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding-bottom: var(--space-2, 8px);
    border-bottom: 1px solid var(--border-color, #333);
    margin-bottom: var(--space-2, 8px);
  }

  .stage-icon {
    font-size: 0.875rem;
  }

  .stage-name {
    font-size: var(--text-sm, 14px);
    font-weight: 500;
    color: var(--text-primary, #fff);
  }

  .stage-count {
    margin-left: auto;
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
    background-color: var(--bg-tertiary, #333);
    padding: 2px 6px;
    border-radius: 10px;
  }

  .artifact-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .artifact-item {
    display: flex;
    align-items: center;
    padding: var(--space-2, 8px);
    border-radius: var(--radius-sm, 4px);
    margin-bottom: var(--space-1, 4px);
    background-color: var(--bg-primary, rgba(0, 0, 0, 0.2));
  }

  .artifact-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .artifact-method {
    font-size: var(--text-sm, 14px);
    color: var(--text-secondary, #ccc);
  }

  .artifact-summary {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
  }

  .preview-section {
    padding: var(--space-4, 16px);
    border-top: 1px solid var(--border-color, #333);
  }

  .preview-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    width: 100%;
    padding: var(--space-3, 12px);
    background-color: var(--bg-primary, #1a1a1a);
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-md, 6px);
    color: var(--text-secondary, #ccc);
    font-size: var(--text-sm, 14px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preview-button:hover {
    background-color: var(--bg-hover, #2a2a2a);
    border-color: var(--accent-color, #0066cc);
    color: var(--text-primary, #fff);
  }

  .provenance-section {
    padding: var(--space-4, 16px);
    border-top: 1px solid var(--border-color, #333);
  }

  .section-title {
    font-size: var(--text-xs, 12px);
    font-weight: 600;
    color: var(--text-tertiary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-3, 12px);
  }

  .provenance-chain {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: wrap;
    justify-content: center;
  }

  .chain-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1, 4px);
  }

  .step-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--bg-tertiary, #333);
    border: 2px solid var(--border-color, #444);
  }

  .step-dot.source {
    background-color: var(--text-tertiary, #666);
  }

  .step-dot.capture {
    background-color: #4a90d9;
  }

  .step-dot.render {
    background-color: #9b59b6;
  }

  .step-dot.extract {
    background-color: #27ae60;
  }

  .step-dot.context {
    background-color: var(--accent-color, #0066cc);
  }

  .step-label {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
  }

  .chain-line {
    width: 20px;
    height: 2px;
    background-color: var(--border-color, #444);
    align-self: flex-start;
    margin-top: 5px;
  }
</style>
