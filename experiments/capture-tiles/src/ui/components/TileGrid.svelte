<script lang="ts">
  import type { CapturedTile } from '$shared/types';

  interface Props {
    tiles: CapturedTile[];
    selectedId: string | undefined;
    onSelect: (tile: CapturedTile) => void;
  }

  let { tiles, selectedId, onSelect }: Props = $props();
</script>

<div class="grid-container">
  {#if tiles.length === 0}
    <div class="empty">
      No tiles captured yet. Navigate to a page and click "Capture Tiles".
    </div>
  {:else}
    <div class="grid">
      {#each tiles as tile (tile.metadata.tile_index)}
        <button
          class="tile"
          class:selected={tile.metadata.capture_id === selectedId}
          onclick={() => onSelect(tile)}
        >
          <img src={tile.imageDataUrl} alt="Tile {tile.metadata.tile_index + 1}" />
          <div class="tile-label">
            {tile.metadata.tile_index + 1}/{tile.metadata.tile_count}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .grid-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #808080;
    font-size: 0.875rem;
    text-align: center;
    padding: 2rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
  }

  .tile {
    position: relative;
    aspect-ratio: 16 / 10;
    background: #1e1e1e;
    border: 2px solid #3c3c3c;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    padding: 0;
  }

  .tile:hover {
    border-color: #0078d4;
  }

  .tile.selected {
    border-color: #0078d4;
    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.3);
  }

  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tile-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.25rem;
    background: rgba(0, 0, 0, 0.7);
    color: #e0e0e0;
    font-size: 0.625rem;
    text-align: center;
  }
</style>
