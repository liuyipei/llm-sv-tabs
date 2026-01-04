<script lang="ts">
  /**
   * ArtifactCard
   *
   * Displays a single artifact with preview, metadata, and actions.
   * Supports both grid and list view modes.
   */
  import type {
    PipelineArtifact,
    CaptureArtifact,
    RenderArtifact,
    ExtractArtifact,
  } from '../../../types/pipeline';
  import type { BinaryBlob } from '../../../types/context-ir';

  type Props = {
    artifact: PipelineArtifact;
    selected: boolean;
    viewMode: 'grid' | 'list';
    onToggleSelect: () => void;
  };

  let { artifact, selected, viewMode, onToggleSelect }: Props = $props();

  function getArtifactTypeLabel(): string {
    switch (artifact.stage) {
      case 'capture': {
        const capture = artifact as CaptureArtifact;
        switch (capture.capture_type) {
          case 'screenshot':
            return 'Screenshot';
          case 'dom_snapshot':
            return 'DOM Snapshot';
          case 'pdf_bytes':
            return 'PDF File';
          case 'image_bytes':
            return 'Image File';
          case 'text':
            return 'Text Content';
          default:
            return 'Capture';
        }
      }
      case 'render': {
        const render = artifact as RenderArtifact;
        switch (render.render_type) {
          case 'pdf_pages':
            return 'PDF Pages';
          case 'scrolling_screenshots':
            return 'Page Screenshots';
          case 'rasterized_pages':
            return 'Rasterized Pages';
          case 'thumbnail':
            return 'Thumbnail';
          default:
            return 'Render';
        }
      }
      case 'extract': {
        const extract = artifact as ExtractArtifact;
        switch (extract.extract_type) {
          case 'text_layer':
            return 'Text Layer';
          case 'ocr':
            return 'OCR';
          case 'vision':
            return 'Vision Extract';
          case 'readability':
            return 'Article Text';
          case 'dom_walker':
            return 'DOM Text';
          default:
            return 'Extract';
        }
      }
      default:
        return 'Unknown';
    }
  }

  function getPreviewContent(): { type: 'image' | 'text' | 'none'; data?: string } {
    switch (artifact.stage) {
      case 'capture': {
        const capture = artifact as CaptureArtifact;
        if (capture.capture_type === 'screenshot' || capture.capture_type === 'image_bytes') {
          const blob = capture.data as BinaryBlob;
          return { type: 'image', data: `data:${blob.mime_type};base64,${blob.data}` };
        }
        if (capture.capture_type === 'text') {
          const text = capture.data as string;
          return { type: 'text', data: text.slice(0, 500) };
        }
        return { type: 'none' };
      }
      case 'render': {
        const render = artifact as RenderArtifact;
        if (render.pages.length > 0) {
          const firstPage = render.pages[0];
          return {
            type: 'image',
            data: `data:${firstPage.image.mime_type};base64,${firstPage.image.data}`,
          };
        }
        return { type: 'none' };
      }
      case 'extract': {
        const extract = artifact as ExtractArtifact;
        return { type: 'text', data: extract.text.slice(0, 500) };
      }
      default:
        return { type: 'none' };
    }
  }

  function getMetadataItems(): Array<{ label: string; value: string }> {
    const items: Array<{ label: string; value: string }> = [];

    // Common metadata
    items.push({ label: 'Method', value: artifact.provenance.method });

    switch (artifact.stage) {
      case 'capture': {
        const capture = artifact as CaptureArtifact;
        if (capture.dimensions) {
          items.push({
            label: 'Dimensions',
            value: `${capture.dimensions.width}×${capture.dimensions.height}`,
          });
        }
        items.push({ label: 'MIME', value: capture.mime_type });
        break;
      }
      case 'render': {
        const render = artifact as RenderArtifact;
        items.push({ label: 'Pages', value: String(render.page_count) });
        if (render.render_config.dpi) {
          items.push({ label: 'DPI', value: String(render.render_config.dpi) });
        }
        items.push({ label: 'Format', value: render.render_config.format.toUpperCase() });
        break;
      }
      case 'extract': {
        const extract = artifact as ExtractArtifact;
        items.push({ label: 'Quality', value: extract.quality });
        items.push({ label: 'Tokens', value: `~${extract.token_estimate.toLocaleString()}` });
        items.push({ label: 'Chars', value: extract.char_count.toLocaleString() });
        break;
      }
    }

    return items;
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const preview = $derived(getPreviewContent());
  const metadata = $derived(getMetadataItems());
</script>

<article
  class="artifact-card"
  class:selected
  class:grid={viewMode === 'grid'}
  class:list={viewMode === 'list'}
>
  <!-- Selection Checkbox -->
  <label class="selection-checkbox">
    <input
      type="checkbox"
      checked={selected}
      onchange={onToggleSelect}
      aria-label="Select artifact for context"
    />
    <span class="checkbox-visual">
      {#if selected}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      {/if}
    </span>
  </label>

  <!-- Preview Area -->
  <div class="preview-area">
    {#if preview.type === 'image' && preview.data}
      <img src={preview.data} alt="Artifact preview" class="preview-image" loading="lazy" />
    {:else if preview.type === 'text' && preview.data}
      <div class="preview-text">
        <pre>{preview.data}{preview.data.length >= 500 ? '...' : ''}</pre>
      </div>
    {:else}
      <div class="preview-placeholder">
        <span class="placeholder-icon">
          {#if artifact.stage === 'capture'}
            📥
          {:else if artifact.stage === 'render'}
            🖼️
          {:else}
            📝
          {/if}
        </span>
        <span class="placeholder-text">No preview</span>
      </div>
    {/if}
  </div>

  <!-- Info Area -->
  <div class="info-area">
    <div class="artifact-header">
      <span class="artifact-type">{getArtifactTypeLabel()}</span>
      <span class="artifact-time" title="Created at">{formatTime(artifact.created_at)}</span>
    </div>

    {#if artifact.label}
      <span class="artifact-label">{artifact.label}</span>
    {/if}

    <div class="metadata-grid">
      {#each metadata as item}
        <div class="metadata-item">
          <span class="metadata-label">{item.label}</span>
          <span class="metadata-value">{item.value}</span>
        </div>
      {/each}
    </div>

    {#if artifact.provenance.duration_ms}
      <span class="duration-badge">
        {formatDuration(artifact.provenance.duration_ms)}
      </span>
    {/if}
  </div>

  <!-- Actions -->
  <div class="actions-area">
    <button class="action-icon" title="View details" aria-label="View artifact details">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </button>
    <button class="action-icon" title="Regenerate" aria-label="Regenerate artifact">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
    </button>
    <button class="action-icon" title="Compare" aria-label="Add to comparison">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    </button>
  </div>
</article>

<style>
  .artifact-card {
    position: relative;
    display: flex;
    background-color: var(--bg-secondary, #242424);
    border: 1px solid var(--border-color, #333);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    transition: all 0.15s ease;
  }

  .artifact-card:hover {
    border-color: var(--border-hover, #444);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .artifact-card.selected {
    border-color: var(--accent-color, #0066cc);
    box-shadow: 0 0 0 1px var(--accent-color, #0066cc);
  }

  /* Grid Layout */
  .artifact-card.grid {
    flex-direction: column;
  }

  .artifact-card.grid .preview-area {
    height: 160px;
  }

  .artifact-card.grid .info-area {
    padding: var(--space-3, 12px);
  }

  .artifact-card.grid .actions-area {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-top: 1px solid var(--border-color, #333);
  }

  /* List Layout */
  .artifact-card.list {
    flex-direction: row;
    align-items: stretch;
  }

  .artifact-card.list .preview-area {
    width: 120px;
    min-height: 80px;
  }

  .artifact-card.list .info-area {
    flex: 1;
    padding: var(--space-3, 12px);
  }

  .artifact-card.list .actions-area {
    padding: var(--space-3, 12px);
    border-left: 1px solid var(--border-color, #333);
    flex-direction: column;
  }

  /* Selection Checkbox */
  .selection-checkbox {
    position: absolute;
    top: var(--space-2, 8px);
    left: var(--space-2, 8px);
    z-index: 10;
    cursor: pointer;
  }

  .selection-checkbox input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkbox-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background-color: var(--bg-primary, #1a1a1a);
    border: 2px solid var(--border-color, #444);
    border-radius: var(--radius-sm, 4px);
    transition: all 0.15s ease;
  }

  .selection-checkbox input:checked + .checkbox-visual {
    background-color: var(--accent-color, #0066cc);
    border-color: var(--accent-color, #0066cc);
    color: white;
  }

  .selection-checkbox:hover .checkbox-visual {
    border-color: var(--accent-color, #0066cc);
  }

  /* Preview Area */
  .preview-area {
    position: relative;
    background-color: var(--bg-tertiary, #333);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .preview-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-text {
    width: 100%;
    height: 100%;
    padding: var(--space-2, 8px);
    overflow: hidden;
  }

  .preview-text pre {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 12px);
    color: var(--text-secondary, #aaa);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
  }

  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1, 4px);
    color: var(--text-tertiary, #666);
  }

  .placeholder-icon {
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .placeholder-text {
    font-size: var(--text-xs, 12px);
  }

  /* Info Area */
  .info-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .artifact-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .artifact-type {
    font-weight: 600;
    font-size: var(--text-sm, 14px);
    color: var(--text-primary, #fff);
  }

  .artifact-time {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
  }

  .artifact-label {
    font-size: var(--text-xs, 12px);
    color: var(--text-secondary, #aaa);
    font-style: italic;
  }

  .metadata-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px) var(--space-4, 16px);
  }

  .metadata-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .metadata-label {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metadata-value {
    font-size: var(--text-sm, 14px);
    color: var(--text-secondary, #ccc);
  }

  .duration-badge {
    display: inline-flex;
    align-self: flex-start;
    padding: 2px var(--space-2, 8px);
    background-color: var(--bg-tertiary, #333);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #888);
  }

  /* Actions Area */
  .actions-area {
    display: flex;
    gap: var(--space-1, 4px);
    background-color: var(--bg-tertiary, rgba(0, 0, 0, 0.2));
  }

  .action-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: var(--radius-sm, 4px);
    color: var(--text-tertiary, #666);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-icon:hover {
    background-color: var(--bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--text-primary, #fff);
  }
</style>
