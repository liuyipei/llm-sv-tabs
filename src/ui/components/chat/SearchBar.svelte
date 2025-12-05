<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { activeTabId, activeTabs } from '$stores/tabs';
  import {
    searchState,
    performDOMSearch,
    findNextDOM,
    findPreviousDOM,
    clearDOMSearch,
  } from '$stores/search';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  // Props
  export let visible = false;
  export let onClose: () => void = () => {};

  // Search state
  let searchInput = '';
  let searchInputElement: HTMLInputElement;
  let activeMatchIndex = 0;
  let totalMatches = 0;
  let isSearching = false;

  // Reactive: Get current tab info to determine search mode
  $: currentTab = $activeTabId ? $activeTabs.get($activeTabId) : null;
  $: hasWebContents = Boolean(currentTab && !currentTab.component);
  $: isSvelteComponentTab = Boolean(currentTab && currentTab.component);

  // Subscribe to DOM search results for Svelte component tabs
  // Use a separate reactive block that only reads the store when needed
  $: svelteSearchResults = isSvelteComponentTab ? $searchState : null;
  $: if (svelteSearchResults) {
    activeMatchIndex = svelteSearchResults.activeMatchIndex;
    totalMatches = svelteSearchResults.totalMatches;
  }

  // Reset search state when active tab changes
  let previousTabId: string | null = null;
  $: if ($activeTabId !== previousTabId) {
    previousTabId = $activeTabId;
    // Reset local search state when switching tabs
    if (searchInput) {
      totalMatches = 0;
      activeMatchIndex = 0;
      // Clear DOM search for previous Svelte component tab
      clearDOMSearch();
    }
  }

  // Focus the input when the bar becomes visible
  $: if (visible && searchInputElement) {
    setTimeout(() => {
      searchInputElement.focus();
      searchInputElement.select();
    }, 0);
  }

  // Clear search when hidden
  $: if (!visible && searchInput) {
    stopFind();
  }

  async function performSearch(): Promise<void> {
    if (!searchInput.trim() || !$activeTabId) {
      totalMatches = 0;
      activeMatchIndex = 0;
      if (isSvelteComponentTab) {
        clearDOMSearch();
      }
      return;
    }

    isSearching = true;
    try {
      if (hasWebContents && ipc) {
        // Use Electron's findInPage for WebContentsView tabs
        const result = await ipc.findInPage($activeTabId, searchInput);
        if (result.success) {
          // Result will be updated via the found-in-page event
        }
      } else if (isSvelteComponentTab) {
        // Use DOM-based search for Svelte component tabs
        performDOMSearch(searchInput);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
    isSearching = false;
  }

  async function findNext(): Promise<void> {
    if (!searchInput.trim() || !$activeTabId) return;

    try {
      if (hasWebContents && ipc) {
        await ipc.findNext($activeTabId);
      } else if (isSvelteComponentTab) {
        findNextDOM();
      }
    } catch (error) {
      console.error('Find next failed:', error);
    }
  }

  async function findPrevious(): Promise<void> {
    if (!searchInput.trim() || !$activeTabId) return;

    try {
      if (hasWebContents && ipc) {
        await ipc.findPrevious($activeTabId);
      } else if (isSvelteComponentTab) {
        findPreviousDOM();
      }
    } catch (error) {
      console.error('Find previous failed:', error);
    }
  }

  async function stopFind(): Promise<void> {
    if (!$activeTabId) return;

    try {
      if (hasWebContents && ipc) {
        await ipc.stopFindInPage($activeTabId);
      }
      if (isSvelteComponentTab) {
        clearDOMSearch();
      }
      totalMatches = 0;
      activeMatchIndex = 0;
    } catch (error) {
      console.error('Stop find failed:', error);
    }
  }

  function handleClose(): void {
    stopFind();
    searchInput = '';
    onClose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        findPrevious();
      } else {
        if (totalMatches > 0) {
          findNext();
        } else {
          performSearch();
        }
      }
    }
  }

  function handleInput(): void {
    // Debounce search while typing
    if (searchInput.trim()) {
      performSearch();
    } else {
      stopFind();
    }
  }

  // Set up listener for found-in-page results
  onMount(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onFoundInPage((data: { activeMatchOrdinal: number; matches: number }) => {
        activeMatchIndex = data.activeMatchOrdinal;
        totalMatches = data.matches;
      });
    }
  });

  // Export focus function for parent to call
  export function focus(): void {
    if (searchInputElement) {
      setTimeout(() => {
        searchInputElement.focus();
        searchInputElement.select();
      }, 0);
    }
  }
</script>

{#if visible}
  <div class="search-bar" class:disabled={!hasWebContents && !isSvelteComponentTab}>
    <div class="search-container">
      <input
        type="text"
        bind:this={searchInputElement}
        bind:value={searchInput}
        oninput={handleInput}
        onkeydown={handleKeydown}
        placeholder={hasWebContents || isSvelteComponentTab ? "Find in page..." : "Search not available for this tab"}
        class="search-input"
        disabled={!hasWebContents && !isSvelteComponentTab}
        title="Find in page (Ctrl+F)"
      />

      {#if searchInput && (hasWebContents || isSvelteComponentTab)}
        <span class="match-count">
          {#if totalMatches > 0}
            {activeMatchIndex} of {totalMatches}
          {:else if isSearching}
            ...
          {:else}
            No matches
          {/if}
        </span>
      {/if}
    </div>

    <div class="search-buttons">
      <button
        onclick={findPrevious}
        class="nav-btn"
        disabled={(!hasWebContents && !isSvelteComponentTab) || totalMatches === 0}
        title="Previous match (Shift+Enter)"
      >
        ▲
      </button>
      <button
        onclick={findNext}
        class="nav-btn"
        disabled={(!hasWebContents && !isSvelteComponentTab) || totalMatches === 0}
        title="Next match (Enter)"
      >
        ▼
      </button>
      <button
        onclick={handleClose}
        class="close-btn"
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  </div>
{/if}

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 15px;
    background-color: #2d2d30;
    border-bottom: 1px solid #3e3e42;
  }

  .search-bar.disabled {
    opacity: 0.6;
  }

  .search-container {
    flex: 1;
    display: flex;
    align-items: center;
    background-color: #3c3c3c;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 0 8px;
    height: 32px;
  }

  .search-container:focus-within {
    border-color: #007acc;
  }

  .search-input {
    flex: 1;
    background: transparent;
    color: #d4d4d4;
    border: none;
    outline: none;
    font-family: inherit;
    font-size: 14px;
    padding: 4px 0;
  }

  .search-input::placeholder {
    color: #808080;
  }

  .search-input:disabled {
    cursor: not-allowed;
  }

  .match-count {
    color: #808080;
    font-size: 12px;
    margin-left: 8px;
    white-space: nowrap;
  }

  .search-buttons {
    display: flex;
    gap: 4px;
  }

  .nav-btn {
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    font-size: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover:not(:disabled) {
    background-color: #4e4e52;
    border-color: #007acc;
  }

  .nav-btn:disabled {
    background-color: #2d2d30;
    color: #606060;
    cursor: not-allowed;
    border-color: #3e3e42;
  }

  .close-btn {
    background-color: transparent;
    color: #d4d4d4;
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background-color: #4e4e52;
    color: #ffffff;
  }
</style>
