<script lang="ts">
  import type {
    SourcePipeline,
    PipelineStage,
    PipelineArtifact,
    CaptureArtifact,
    RenderArtifact,
    ExtractArtifact,
    BinaryBlob,
  } from '$lib/types';
  import { addToComparison, log } from '$lib/stores/experiment';

  type Props = {
    pipeline: SourcePipeline;
    stage: PipelineStage;
    artifacts: PipelineArtifact[];
    onToggleSelect: (artifactId: string) => void;
  };

  let { pipeline, stage, artifacts, onToggleSelect }: Props = $props();

  function isSelected(artifactId: string): boolean {
    return pipeline.selection.artifact_ids.has(artifactId);
  }

  function getArtifactTypeLabel(artifact: PipelineArtifact): string {
    switch (artifact.stage) {
      case 'capture': {
        const cap = artifact as CaptureArtifact;
        return cap.capture_type.replace('_', ' ');
      }
      case 'render': {
        const ren = artifact as RenderArtifact;
        return `${ren.page_count} pages`;
      }
      case 'extract': {
        const ext = artifact as ExtractArtifact;
        return ext.extract_type.replace('_', ' ');
      }
      default:
        return 'unknown';
    }
  }

  function getPreviewContent(artifact: PipelineArtifact): { type: 'image' | 'text' | 'none'; data?: string } {
    switch (artifact.stage) {
      case 'capture': {
        const cap = artifact as CaptureArtifact;
        if (cap.capture_type === 'screenshot' || cap.capture_type === 'image_bytes') {
          const blob = cap.data as BinaryBlob;
          // Handle both raw base64 and data URLs
          const imageData = blob.data.startsWith('data:') ? blob.data : `data:${blob.mime_type};base64,${blob.data}`;
          return { type: 'image', data: imageData };
        }
        if (cap.capture_type === 'text' || cap.capture_type === 'dom_snapshot') {
          return { type: 'text', data: (cap.data as string).slice(0, 300) };
        }
        return { type: 'none' };
      }
      case 'render': {
        const ren = artifact as RenderArtifact;
        if (ren.pages.length > 0) {
          const page = ren.pages[0];
          // Handle both raw base64 and data URLs
          const imageData = page.image.data.startsWith('data:') ? page.image.data : `data:${page.image.mime_type};base64,${page.image.data}`;
          return { type: 'image', data: imageData };
        }
        return { type: 'none' };
      }
      case 'extract': {
        const ext = artifact as ExtractArtifact;
        return { type: 'text', data: ext.text.slice(0, 300) };
      }
      default:
        return { type: 'none' };
    }
  }

  function formatDuration(ms?: number): string {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }
</script>

<div class="stage-panel">
  {#if artifacts.length === 0}
    <div class="empty-stage">
      <span class="empty-icon">
        {#if stage === 'capture'}📥{:else if stage === 'render'}🖼️{:else}📝{/if}
      </span>
      <p class="empty-text">No artifacts in this stage yet.</p>
      <button class="run-btn">
        {#if stage === 'capture'}
          Capture Source
        {:else if stage === 'render'}
          Render Pages
        {:else}
          Extract Text
        {/if}
      </button>
    </div>
  {:else}
    <div class="artifact-grid">
      {#each artifacts as artifact (artifact.artifact_id)}
        {@const preview = getPreviewContent(artifact)}
        {@const selected = isSelected(artifact.artifact_id)}
        <article class="artifact-card" class:selected>
          <!-- Selection Checkbox -->
          <label class="selection-checkbox">
            <input
              type="checkbox"
              checked={selected}
              onchange={() => onToggleSelect(artifact.artifact_id)}
            />
            <span class="checkbox-visual">
              {#if selected}✓{/if}
            </span>
          </label>

          <!-- Preview -->
          <div class="artifact-preview">
            {#if preview.type === 'image' && preview.data}
              <img src={preview.data} alt="Preview" class="preview-image" />
            {:else if preview.type === 'text' && preview.data}
              <pre class="preview-text">{preview.data}...</pre>
            {:else}
              <div class="preview-placeholder">
                <span>No preview</span>
              </div>
            {/if}
          </div>

          <!-- Info -->
          <div class="artifact-info">
            <div class="info-header">
              <span class="artifact-type">{getArtifactTypeLabel(artifact)}</span>
              <span class="artifact-time">{formatTime(artifact.created_at)}</span>
            </div>

            <div class="info-details">
              <div class="detail-row">
                <span class="detail-label">Method:</span>
                <span class="detail-value">{artifact.provenance.method}</span>
              </div>
              {#if artifact.provenance.duration_ms}
                <div class="detail-row">
                  <span class="detail-label">Duration:</span>
                  <span class="detail-value">{formatDuration(artifact.provenance.duration_ms)}</span>
                </div>
              {/if}
              {#if artifact.stage === 'extract'}
                {@const ext = artifact as ExtractArtifact}
                <div class="detail-row">
                  <span class="detail-label">Quality:</span>
                  <span class="detail-value quality-{ext.quality}">{ext.quality}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Tokens:</span>
                  <span class="detail-value">~{ext.token_estimate.toLocaleString()}</span>
                </div>
              {/if}
              {#if artifact.stage === 'render'}
                {@const ren = artifact as RenderArtifact}
                <div class="detail-row">
                  <span class="detail-label">DPI:</span>
                  <span class="detail-value">{ren.render_config.dpi}</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Actions -->
          <div class="artifact-actions">
            <button
              class="action-icon"
              onclick={() => addToComparison(artifact.artifact_id)}
              title="Add to comparison"
            >
              ⚖️
            </button>
            <button class="action-icon" onclick={() => log('info', 'View details')} title="View details">
              🔍
            </button>
            <button class="action-icon" onclick={() => log('info', 'Regenerate')} title="Regenerate">
              ↻
            </button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .stage-panel {
    min-height: 200px;
  }

  .empty-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: var(--space-3);
    opacity: 0.5;
  }

  .empty-text {
    color: var(--text-tertiary);
    margin: 0 0 var(--space-4);
  }

  .run-btn {
    padding: var(--space-3) var(--space-6);
    background-color: var(--accent-color);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .run-btn:hover {
    background-color: var(--accent-hover);
  }

  .artifact-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-4);
  }

  .artifact-card {
    position: relative;
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 0.15s;
  }

  .artifact-card:hover {
    border-color: var(--text-tertiary);
  }

  .artifact-card.selected {
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
  }

  .selection-checkbox {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    z-index: 10;
    cursor: pointer;
  }

  .selection-checkbox input {
    display: none;
  }

  .checkbox-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background-color: var(--bg-primary);
    border: 2px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: white;
    font-size: 0.875rem;
    transition: all 0.15s;
  }

  .selection-checkbox input:checked + .checkbox-visual {
    background-color: var(--accent-color);
    border-color: var(--accent-color);
  }

  .artifact-preview {
    height: 150px;
    background-color: var(--bg-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .preview-text {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: pre-wrap;
    overflow: hidden;
    line-height: 1.4;
  }

  .preview-placeholder {
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }

  .artifact-info {
    padding: var(--space-3);
  }

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .artifact-type {
    font-weight: 600;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .artifact-time {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .info-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }

  .detail-label {
    color: var(--text-tertiary);
  }

  .detail-value {
    color: var(--text-secondary);
  }

  .detail-value.quality-good {
    color: var(--success-color);
  }

  .detail-value.quality-mixed {
    color: var(--warning-color);
  }

  .detail-value.quality-low,
  .detail-value.quality-ocr_like {
    color: var(--error-color);
  }

  .artifact-actions {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background-color: var(--bg-tertiary);
    border-top: 1px solid var(--border-color);
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-icon:hover {
    background-color: var(--bg-secondary);
  }
</style>
