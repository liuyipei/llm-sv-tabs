<script lang="ts">
  import { onMount } from 'svelte';
  import UrlBar from './components/UrlBar.svelte';
  import CapturePanel from './components/CapturePanel.svelte';
  import TileGrid from './components/TileGrid.svelte';
  import TileDetail from './components/TileDetail.svelte';
  import type {
    CapturedTile,
    CaptureProgress,
    CaptureWarning,
    NavigationState,
    CaptureConfig,
  } from '$shared/types';

  // State
  let navState = $state<NavigationState>({
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });

  let tiles = $state<CapturedTile[]>([]);
  let selectedTile = $state<CapturedTile | null>(null);
  let isCapturing = $state(false);
  let progress = $state<CaptureProgress | null>(null);
  let lastWarning = $state<CaptureWarning | null>(null);
  let error = $state<string | null>(null);

  let config = $state<CaptureConfig>({
    viewport: { width: 1440, height: 900 },
    overlapRatio: 0.15,
  });

  // Set up IPC listeners
  onMount(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(
      window.captureAPI.onNavigationState((state) => {
        navState = state;
      })
    );

    cleanups.push(
      window.captureAPI.onCaptureTile((tile) => {
        tiles = [...tiles, tile];
      })
    );

    cleanups.push(
      window.captureAPI.onCaptureProgress((p) => {
        progress = p;
      })
    );

    cleanups.push(
      window.captureAPI.onCaptureWarning((warning) => {
        lastWarning = warning;
        // Could show a modal here to ask user to continue/stop
      })
    );

    cleanups.push(
      window.captureAPI.onCaptureComplete(() => {
        isCapturing = false;
        progress = null;
      })
    );

    cleanups.push(
      window.captureAPI.onCaptureError((err) => {
        error = err;
        isCapturing = false;
        progress = null;
      })
    );

    return () => cleanups.forEach((fn) => fn());
  });

  async function handleNavigate(url: string) {
    error = null;
    const result = await window.captureAPI.navigate(url);
    if (!result.success) {
      error = result.error || 'Navigation failed';
    }
  }

  async function handleStartCapture() {
    error = null;
    tiles = [];
    selectedTile = null;
    lastWarning = null;
    isCapturing = true;

    const result = await window.captureAPI.startCapture(config);
    if (!result.success) {
      error = result.error || 'Capture failed';
      isCapturing = false;
    }
  }

  async function handleStopCapture() {
    await window.captureAPI.stopCapture();
    isCapturing = false;
  }

  async function handleExport(format: 'files' | 'clipboard' | 'both') {
    if (tiles.length === 0) return;

    const result = await window.captureAPI.exportTiles(tiles, {
      format,
      includeMetadata: true,
      includePreamble: true,
    });

    if (!result.success) {
      error = result.error || 'Export failed';
    }
  }

  function handleSelectTile(tile: CapturedTile) {
    selectedTile = tile;
  }

  function handleCloseDetail() {
    selectedTile = null;
  }
</script>

<div class="app">
  <div class="panel">
    <UrlBar
      url={navState.url}
      isLoading={navState.isLoading}
      onNavigate={handleNavigate}
    />

    {#if error}
      <div class="error">
        {error}
        <button onclick={() => (error = null)}>Dismiss</button>
      </div>
    {/if}

    <CapturePanel
      {config}
      {isCapturing}
      {progress}
      {lastWarning}
      hasUrl={!!navState.url}
      tileCount={tiles.length}
      onConfigChange={(c) => (config = c)}
      onStart={handleStartCapture}
      onStop={handleStopCapture}
      onExport={handleExport}
    />

    <TileGrid
      {tiles}
      selectedId={selectedTile?.metadata.capture_id}
      onSelect={handleSelectTile}
    />
  </div>

  {#if selectedTile}
    <TileDetail tile={selectedTile} onClose={handleCloseDetail} />
  {/if}
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #252526;
  }

  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: #5a1d1d;
    color: #f48771;
    font-size: 0.875rem;
  }

  .error button {
    background: transparent;
    border: 1px solid #f48771;
    color: #f48771;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .error button:hover {
    background: rgba(244, 135, 113, 0.1);
  }
</style>
