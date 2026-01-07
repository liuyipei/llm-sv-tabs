<script lang="ts">
  import { pipelines, totalSelectedArtifacts } from '$lib/stores/experiment';
  import type { ExtractArtifact } from '$lib/types';
  import { PIPELINE_STAGES } from '$lib/types';

  let viewMode = $state<'rendered' | 'raw'>('rendered');

  function getSelectedContent(): string {
    let content = '=== CONTEXT INDEX ===\n\n';
    let chunks = '\n=== CONTENT ===\n';
    let totalTokens = 0;
    let index = 1;

    for (const [sourceId, pipeline] of $pipelines) {
      const selectedIds = pipeline.selection.artifact_ids;
      if (selectedIds.size === 0) continue;

      content += `[${index}] ${sourceId} | ${pipeline.source_info.type} | "${pipeline.source_info.title}"\n`;

      // Find selected extract artifacts
      for (const artifact of pipeline.stages.extract) {
        if (selectedIds.has(artifact.artifact_id)) {
          const ext = artifact as ExtractArtifact;
          chunks += `\n[CHUNK]\nanchor: ${ext.source_anchor}\nmethod: ${ext.extract_type}\nquality: ${ext.quality}\n---\n${ext.text}\n[/CHUNK]\n`;
          totalTokens += ext.token_estimate;
        }
      }

      index++;
    }

    content += `\n=== STATISTICS ===\nTotal tokens: ~${totalTokens.toLocaleString()}\n`;
    content += chunks;

    return content;
  }

  const contextContent = $derived(getSelectedContent());
</script>

<div class="preview-panel">
  <h2 class="section-title">Context Preview</h2>

  <div class="preview-header">
    <div class="stats">
      <span class="stat">
        <span class="stat-value">{$totalSelectedArtifacts}</span>
        <span class="stat-label">artifacts</span>
      </span>
      <span class="stat">
        <span class="stat-value">{$pipelines.size}</span>
        <span class="stat-label">sources</span>
      </span>
    </div>

    <div class="view-toggle">
      <button
        class="toggle-btn"
        class:active={viewMode === 'rendered'}
        onclick={() => viewMode = 'rendered'}
      >
        Rendered
      </button>
      <button
        class="toggle-btn"
        class:active={viewMode === 'raw'}
        onclick={() => viewMode = 'raw'}
      >
        Raw
      </button>
    </div>
  </div>

  {#if $totalSelectedArtifacts === 0}
    <div class="empty-state">
      <span class="empty-icon">📋</span>
      <p>No artifacts selected.</p>
      <p class="hint">Select artifacts from pipelines to preview what would be sent to the model.</p>
    </div>
  {:else}
    <div class="preview-content">
      {#if viewMode === 'rendered'}
        <div class="rendered-view">
          {#each [...$pipelines.values()] as pipeline}
            {#if pipeline.selection.artifact_ids.size > 0}
              <div class="source-block">
                <div class="source-header">
                  <span class="source-icon">
                    {pipeline.source_info.type === 'pdf' ? '📄' :
                     pipeline.source_info.type === 'webpage' ? '🌐' : '📝'}
                  </span>
                  <span class="source-title">{pipeline.source_info.title}</span>
                  <code class="source-id">{pipeline.source_id}</code>
                </div>
                {#each pipeline.stages.extract as artifact}
                  {#if pipeline.selection.artifact_ids.has(artifact.artifact_id)}
                    {@const ext = artifact as ExtractArtifact}
                    <div class="content-block">
                      <div class="content-meta">
                        <span class="meta-badge">{ext.extract_type}</span>
                        <span class="meta-badge quality-{ext.quality}">{ext.quality}</span>
                        <span class="meta-tokens">~{ext.token_estimate} tokens</span>
                      </div>
                      <div class="content-text">{ext.text}</div>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <pre class="raw-view">{contextContent}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .preview-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-4);
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .stats {
    display: flex;
    gap: var(--space-4);
  }

  .stat {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--accent-color);
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .view-toggle {
    display: flex;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: 2px;
  }

  .toggle-btn {
    padding: var(--space-2) var(--space-4);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .toggle-btn.active {
    background-color: var(--accent-color);
    color: white;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: var(--space-3);
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-tertiary);
  }

  .empty-state .hint {
    font-size: 0.875rem;
    margin-top: var(--space-2);
  }

  .preview-content {
    flex: 1;
    overflow: auto;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .rendered-view {
    padding: var(--space-4);
  }

  .source-block {
    margin-bottom: var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .source-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
  }

  .source-icon {
    font-size: 1rem;
  }

  .source-title {
    font-weight: 500;
    color: var(--text-primary);
  }

  .source-id {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-tertiary);
    background-color: var(--bg-primary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .content-block {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-color);
  }

  .content-block:last-child {
    border-bottom: none;
  }

  .content-meta {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .meta-badge {
    padding: 2px 8px;
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .meta-badge.quality-good { color: var(--success-color); }
  .meta-badge.quality-mixed { color: var(--warning-color); }
  .meta-badge.quality-low, .meta-badge.quality-ocr_like { color: var(--error-color); }

  .meta-tokens {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .content-text {
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .raw-view {
    margin: 0;
    padding: var(--space-4);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: pre-wrap;
    line-height: 1.5;
  }
</style>
