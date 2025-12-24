<script lang="ts">
  import { getContext } from 'svelte';
  import { sortMode, sortDirection } from '$stores/tabs';
  import type { SortMode } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  let { tabCount }: { tabCount: number } = $props();
  const ipc = getContext<IPCBridgeAPI>('ipc');

  function setSortMode(mode: SortMode): void {
    sortMode.set(mode);
  }

  function toggleSortDirection(): void {
    sortDirection.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
  }

  async function openAggregateTab(): Promise<void> {
    if (!ipc?.openAggregateTab) return;
    try {
      await ipc.openAggregateTab();
    } catch (error) {
      console.error('Failed to open aggregate tabs view:', error);
    }
  }
</script>

<div class="tab-controls">
  <div class="header-row">
    <div class="tabs-label" title="Ctrl+Tab: Next tab, Ctrl+Shift+Tab: Previous tab">
      <h2>Tabs</h2>
      <span class="tab-count">{tabCount}</span>
    </div>
    <div class="aggregate-button">
      <button onclick={openAggregateTab} title="View all tabs across windows">
        🗂️ All tabs
      </button>
    </div>
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
</div>

<style>
  .tab-controls {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-5);
  }

  .tabs-label {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-primary);
  }

  .tab-count {
    background-color: var(--bg-hover);
    color: var(--text-primary);
    padding: var(--space-1) var(--space-3);
    border-radius: 10px;
    font-size: 0.6875rem;
  }

  .sort-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .aggregate-button {
    flex-shrink: 0;
  }

  button {
    background-color: var(--bg-hover);
    color: var(--text-primary);
    border: none;
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-default);
    font-size: 0.6875rem;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  button:hover {
    background-color: var(--bg-input);
  }

  button.active {
    background-color: var(--accent-color);
    color: var(--text-bright);
  }

  button:last-child {
    min-width: 35px;
  }
</style>
