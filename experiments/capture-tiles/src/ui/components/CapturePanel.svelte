<script lang="ts">
  import type { CaptureConfig, CaptureProgress, CaptureWarning } from '$shared/types';

  interface Props {
    config: CaptureConfig;
    isCapturing: boolean;
    progress: CaptureProgress | null;
    lastWarning: CaptureWarning | null;
    hasUrl: boolean;
    tileCount: number;
    onConfigChange: (config: CaptureConfig) => void;
    onStart: () => void;
    onStop: () => void;
    onExport: (format: 'files' | 'clipboard' | 'both') => void;
  }

  let {
    config,
    isCapturing,
    progress,
    lastWarning,
    hasUrl,
    tileCount,
    onConfigChange,
    onStart,
    onStop,
    onExport,
  }: Props = $props();

  // Viewport presets
  const viewportPresets = [
    { label: '1440×900', width: 1440, height: 900 },
    { label: '1280×800', width: 1280, height: 800 },
    { label: '1920×1080', width: 1920, height: 1080 },
  ];

  let selectedPreset = $state('1440×900');

  function handlePresetChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    selectedPreset = target.value;
    const preset = viewportPresets.find((p) => p.label === selectedPreset);
    if (preset) {
      onConfigChange({
        ...config,
        viewport: { width: preset.width, height: preset.height },
      });
    }
  }

  function handleOverlapChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    onConfigChange({
      ...config,
      overlapRatio: parseFloat(target.value),
    });
  }

  function formatWarning(warning: CaptureWarning): string {
    if (warning.type === 'tile_limit') {
      return `Captured ${warning.count} tiles`;
    } else {
      return `Est. ${Math.round(warning.estimated / 1000)}k tokens`;
    }
  }
</script>

<div class="panel">
  <div class="section">
    <h3>Capture Settings</h3>
    <div class="settings">
      <label>
        Viewport
        <select value={selectedPreset} onchange={handlePresetChange} disabled={isCapturing}>
          {#each viewportPresets as preset}
            <option value={preset.label}>{preset.label}</option>
          {/each}
        </select>
      </label>

      <label>
        Overlap
        <select value={config.overlapRatio} onchange={handleOverlapChange} disabled={isCapturing}>
          <option value={0.1}>10%</option>
          <option value={0.15}>15%</option>
          <option value={0.2}>20%</option>
        </select>
      </label>
    </div>
  </div>

  <div class="section">
    <div class="actions">
      {#if isCapturing}
        <button class="stop" onclick={onStop}>Stop Capture</button>
      {:else}
        <button class="start" onclick={onStart} disabled={!hasUrl}>
          Capture Tiles
        </button>
      {/if}
    </div>

    {#if progress}
      <div class="progress">
        <div class="progress-text">
          Tile {progress.tile_index + 1} • {Math.round(progress.estimated_tokens / 1000)}k tokens
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {Math.min(100, (progress.scroll_y / Math.max(1, progress.max_scroll)) * 100)}%"
          ></div>
        </div>
      </div>
    {/if}

    {#if lastWarning}
      <div class="warning">
        {formatWarning(lastWarning)}
      </div>
    {/if}
  </div>

  {#if tileCount > 0 && !isCapturing}
    <div class="section">
      <h3>Export ({tileCount} tiles)</h3>
      <div class="export-buttons">
        <button onclick={() => onExport('files')}>Save to Folder</button>
        <button onclick={() => onExport('clipboard')}>Copy JSON</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    padding: 1rem;
    border-bottom: 1px solid #3c3c3c;
  }

  .section {
    margin-bottom: 1rem;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  h3 {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #808080;
    margin-bottom: 0.5rem;
  }

  .settings {
    display: flex;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #a0a0a0;
  }

  select {
    padding: 0.375rem 0.5rem;
    background: #3c3c3c;
    border: 1px solid #4a4a4a;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 0.875rem;
  }

  select:disabled {
    opacity: 0.5;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  button {
    flex: 1;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  button.start {
    background: #0e639c;
    color: white;
  }

  button.start:hover:not(:disabled) {
    background: #1177bb;
  }

  button.start:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.stop {
    background: #c53030;
    color: white;
  }

  button.stop:hover {
    background: #e53e3e;
  }

  .progress {
    margin-top: 0.75rem;
  }

  .progress-text {
    font-size: 0.75rem;
    color: #a0a0a0;
    margin-bottom: 0.25rem;
  }

  .progress-bar {
    height: 4px;
    background: #3c3c3c;
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #0e639c;
    transition: width 0.3s ease;
  }

  .warning {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #5a4a1d;
    color: #f5c842;
    font-size: 0.75rem;
    border-radius: 4px;
  }

  .export-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .export-buttons button {
    background: #3c3c3c;
    color: #e0e0e0;
  }

  .export-buttons button:hover {
    background: #4a4a4a;
  }
</style>
