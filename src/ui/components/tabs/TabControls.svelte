<script lang="ts">
  import { sortMode, sortDirection } from '$stores/tabs';
  import type { SortMode } from '../../../types';

  function setSortMode(mode: SortMode): void {
    sortMode.set(mode);
  }

  function toggleSortDirection(): void {
    sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }
</script>

<div class="tab-controls">
  <div class="sort-buttons">
    <button
      class:active={$sortMode === 'time'}
      onclick={() => setSortMode('time')}
      title="Sort by time"
    >
      Time
    </button>
    <button
      class:active={$sortMode === 'url'}
      onclick={() => setSortMode('url')}
      title="Sort by URL"
    >
      URL
    </button>
    <button
      class:active={$sortMode === 'title'}
      onclick={() => setSortMode('title')}
      title="Sort by title"
    >
      Title
    </button>
    <button onclick={toggleSortDirection} title="Toggle sort direction">
      {$sortDirection === 'asc' ? '↑' : '↓'}
    </button>
  </div>
</div>

<style>
  .tab-controls {
    padding: 8px 10px;
    border-bottom: 1px solid #3e3e42;
    flex-shrink: 0;
  }

  .sort-buttons {
    display: flex;
    gap: 4px;
  }

  button {
    flex: 1;
    background-color: #3e3e42;
    color: #d4d4d4;
    border: none;
    padding: 5px 10px;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  button:hover {
    background-color: #4e4e52;
  }

  button.active {
    background-color: #007acc;
    color: white;
  }

  button:last-child {
    flex: 0;
    min-width: 35px;
  }
</style>
