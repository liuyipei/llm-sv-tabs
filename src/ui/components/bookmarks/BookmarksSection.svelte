<script lang="ts">
  import { getContext } from 'svelte';
  import BookmarkList from './BookmarkList.svelte';
  import { bookmarksCollapsed } from '$stores/ui';
  import { activeTabId, sortedTabs } from '$stores/tabs';
  import { toastStore } from '$stores/toast';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import { handleBookmarkResponse } from '$lib/bookmark-results';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  function toggleBookmarks(): void {
    bookmarksCollapsed.update((collapsed) => !collapsed);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleBookmarks();
    }
  }

  async function addBookmarkFromCurrentTab(event: MouseEvent): Promise<void> {
    event.stopPropagation(); // Prevent toggling the bookmarks section

    const currentActiveTabId = $activeTabId;
    if (!currentActiveTabId || !ipc) return;

    // Find the active tab
    const activeTab = $sortedTabs.find((tab) => tab.id === currentActiveTabId);
    if (!activeTab) return;

    try {
      const result = await ipc.addBookmark({
        title: activeTab.title,
        url: activeTab.url,
        // Include file metadata for file-based bookmarks (PDFs, images, text files)
        filePath: activeTab.metadata?.filePath,
        fileType: activeTab.metadata?.fileType,
      });

      if (!handleBookmarkResponse(result)) {
        toastStore.show('Failed to add bookmark', 'error');
      }
    } catch (error) {
      console.error('Failed to bookmark tab:', error);
      toastStore.show('Failed to add bookmark', 'error');
    }
  }
</script>

<div class="bookmarks-section">
  <div class="section-header" onclick={toggleBookmarks} onkeydown={handleKeydown} role="button" tabindex="0">
    <h2>Bookmarks</h2>
    <div class="header-actions">
      <button
        class="add-bookmark-btn"
        onclick={addBookmarkFromCurrentTab}
        title="Bookmark current tab (Ctrl+D)"
      >
        +
      </button>
      <span class="toggle-icon">{$bookmarksCollapsed ? '▶' : '▼'}</span>
    </div>
  </div>
  {#if !$bookmarksCollapsed}
    <BookmarkList />
  {/if}
</div>

<style>
  .bookmarks-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-7);
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    user-select: none;
  }

  .section-header:hover,
  .section-header:focus-visible {
    background-color: var(--bg-tertiary);
    outline: none;
  }

  h2 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }

  .add-bookmark-btn {
    background-color: var(--accent-color);
    color: var(--text-bright);
    border: none;
    border-radius: var(--radius-default);
    width: 24px;
    height: 24px;
    font-size: var(--text-xl);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--transition-fast);
    padding: 0;
    line-height: var(--leading-tight);
  }

  .add-bookmark-btn:hover,
  .add-bookmark-btn:focus-visible {
    background-color: var(--accent-hover);
    outline: none;
  }

  .toggle-icon {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
</style>
