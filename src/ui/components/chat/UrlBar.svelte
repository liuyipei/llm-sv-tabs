<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { urlInput } from '$stores/ui';
  import { searchStore } from '$stores/search';
  import { activeTabId, activeTabs } from '$stores/tabs';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  const ipc = getContext<IPCBridgeAPI>('ipc');
  const setFocusUrlInputCallback = getContext<(callback: () => void) => void>('setFocusUrlInputCallback');

  let urlInputElement: HTMLInputElement;
  let searchInputElement: HTMLInputElement;

  async function handleUrlSubmit(): Promise<void> {
    if (!$urlInput.trim()) return;
    const url = $urlInput.trim();
    const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
    if (ipc) {
      try {
        await ipc.openUrl(fullUrl);
        $urlInput = '';
      } catch (error) {
        console.error('Failed to open URL:', error);
      }
    }
  }

  function handleUrlKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleUrlSubmit();
    }
  }

  function focusUrlInputElement(): void {
    if (urlInputElement) {
      urlInputElement.focus();
      urlInputElement.select();
    }
  }

  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    searchStore.setQuery(target.value);
  }

  async function searchNext(): Promise<void> {
    if (!$searchStore.query || !$activeTabId) return;
    const tab = $activeTabs.get($activeTabId);
    if (!tab || tab.type === 'notes' || tab.component === 'llm-response') return;
    try {
      const result = await ipc.findInPage($activeTabId, $searchStore.query, { forward: true, findNext: true });
      if (result.success && result.data) {
        searchStore.setMatches(result.data.activeMatchOrdinal, result.data.matches);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  async function searchPrevious(): Promise<void> {
    if (!$searchStore.query || !$activeTabId) return;
    const tab = $activeTabs.get($activeTabId);
    if (!tab || tab.type === 'notes' || tab.component === 'llm-response') return;
    try {
      const result = await ipc.findInPage($activeTabId, $searchStore.query, { forward: false, findNext: true });
      if (result.success && result.data) {
        searchStore.setMatches(result.data.activeMatchOrdinal, result.data.matches);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  function clearSearch(): void {
    if ($activeTabId) {
      const tab = $activeTabs.get($activeTabId);
      if (tab && tab.type !== 'notes' && tab.component !== 'llm-response') {
        ipc.stopFindInPage($activeTabId, 'clearSelection');
      }
    }
    searchStore.reset();
    if (searchInputElement) {
      searchInputElement.value = '';
    }
  }

  function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        searchPrevious();
      } else {
        searchNext();
      }
    } else if (event.key === 'Escape') {
      clearSearch();
    }
  }

  // Auto-search on query change
  $: if ($searchStore.query && $activeTabId) {
    const tab = $activeTabs.get($activeTabId);
    if (tab && tab.type !== 'notes' && tab.component !== 'llm-response') {
      ipc.findInPage($activeTabId, $searchStore.query, { forward: true, findNext: false })
        .then((result) => {
          if (result.success && result.data) {
            searchStore.setMatches(result.data.activeMatchOrdinal, result.data.matches);
          }
        })
        .catch((error) => console.error('Search error:', error));
    }
  }

  onMount(() => {
    if (setFocusUrlInputCallback) {
      setFocusUrlInputCallback(focusUrlInputElement);
    }
  });
</script>

<div class="url-bar-container">
  <!-- URL Bar Row -->
  <div class="url-bar">
    <input
      type="text"
      bind:this={urlInputElement}
      bind:value={$urlInput}
      onkeydown={handleUrlKeydown}
      placeholder="Enter URL..."
      class="url-input"
    />
    <button onclick={handleUrlSubmit} class="btn" disabled={!$urlInput.trim()}>
      Open
    </button>
  </div>

  <!-- Search Bar Row (Always Visible) -->
  <div class="search-bar">
    <input
      type="text"
      bind:this={searchInputElement}
      value={$searchStore.query}
      oninput={handleSearchInput}
      onkeydown={handleSearchKeydown}
      placeholder="Find in page (Ctrl+F)..."
      class="search-input"
    />
    <span class="search-status">
      {#if $searchStore.totalMatches > 0}
        {$searchStore.currentMatch}/{$searchStore.totalMatches}
      {:else if $searchStore.query}
        0/0
      {/if}
    </span>
    <button onclick={searchPrevious} class="btn-small" disabled={$searchStore.totalMatches === 0} title="Previous (Shift+Enter)">↑</button>
    <button onclick={searchNext} class="btn-small" disabled={$searchStore.totalMatches === 0} title="Next (Enter)">↓</button>
    <button onclick={clearSearch} class="btn-small" disabled={!$searchStore.query} title="Clear (Esc)">✕</button>
  </div>
</div>

<style>
  .url-bar-container {
    background-color: #252526;
    border-bottom: 1px solid #3e3e42;
  }

  .url-bar, .search-bar {
    display: flex;
    gap: 8px;
    padding: 6px 15px;
    align-items: center;
  }

  .search-bar {
    border-top: 1px solid #3e3e42;
  }

  .url-input, .search-input {
    flex: 1;
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 3px;
    padding: 6px 10px;
    font-size: 13px;
    height: 30px;
  }

  .url-input:focus, .search-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .search-status {
    font-size: 12px;
    color: #a0a0a0;
    min-width: 50px;
    text-align: center;
  }

  .btn {
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
    height: 30px;
  }

  .btn:hover:not(:disabled) {
    background-color: #005a9e;
  }

  .btn:disabled {
    background-color: #3e3e42;
    color: #808080;
    cursor: not-allowed;
  }

  .btn-small {
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
    min-width: 28px;
    height: 28px;
  }

  .btn-small:hover:not(:disabled) {
    background-color: #4e4e52;
    border-color: #007acc;
  }

  .btn-small:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
