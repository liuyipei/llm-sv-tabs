<script lang="ts">
  import type { CapturedTile } from '$shared/types';

  interface Props {
    tile: CapturedTile;
    onClose: () => void;
  }

  let { tile, onClose }: Props = $props();

  let meta = $derived(tile.metadata);
</script>

<div class="overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
    <div class="header">
      <h2>Tile {meta.tile_index + 1} of {meta.tile_count}</h2>
      <button class="close" onclick={onClose}>×</button>
    </div>

    <div class="content">
      <div class="image-container">
        <img src={tile.imageDataUrl} alt="Tile {meta.tile_index + 1}" />
      </div>

      <div class="metadata">
        <h3>Metadata</h3>
        <dl>
          <dt>Scroll Y</dt>
          <dd>{meta.scroll_y_px}px</dd>

          <dt>Viewport</dt>
          <dd>{meta.viewport_px}</dd>

          <dt>Overlap</dt>
          <dd>{(meta.overlap_ratio * 100).toFixed(0)}%</dd>

          <dt>Capture ID</dt>
          <dd class="mono">{meta.capture_id}</dd>

          <dt>URL</dt>
          <dd class="url">{meta.url}</dd>

          <dt>Timestamp</dt>
          <dd>{new Date(meta.timestamp).toLocaleString()}</dd>

          {#if meta.device_pixel_ratio}
            <dt>DPR</dt>
            <dd>{meta.device_pixel_ratio}x</dd>
          {/if}
        </dl>

        <h3>Label for LLM</h3>
        <pre class="label">[Tile {String(meta.tile_index + 1).padStart(2, '0')}/{String(meta.tile_count).padStart(2, '0')}]
url={meta.url}
scroll_y_px={meta.scroll_y_px}
viewport={meta.viewport_px}
overlap={meta.overlap_ratio}
capture_id={meta.capture_id}</pre>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: #252526;
    border-radius: 8px;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #3c3c3c;
  }

  .header h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  .close {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    color: #808080;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close:hover {
    background: #3c3c3c;
    color: #e0e0e0;
  }

  .content {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    overflow: auto;
  }

  .image-container {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .image-container img {
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .metadata {
    width: 280px;
    flex-shrink: 0;
  }

  .metadata h3 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #808080;
    margin-bottom: 0.5rem;
    margin-top: 1rem;
  }

  .metadata h3:first-child {
    margin-top: 0;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    font-size: 0.8125rem;
  }

  dt {
    color: #808080;
  }

  dd {
    color: #e0e0e0;
    word-break: break-all;
  }

  dd.mono {
    font-family: monospace;
    font-size: 0.75rem;
  }

  dd.url {
    font-size: 0.75rem;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label {
    background: #1e1e1e;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
    color: #a0a0a0;
    overflow-x: auto;
    white-space: pre;
  }
</style>
