<script lang="ts">
  import { getContext } from 'svelte';
  import BookmarkList from './BookmarkList.svelte';
  import { bookmarksCollapsed } from '$stores/ui';
  import { activeTabId, sortedTabs } from '$stores/tabs';
  import { addBookmark as addBookmarkToStore } from '$stores/bookmarks';
  import { toastStore } from '$stores/toast';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

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
      });

      if ((result as any)?.success && (result as any)?.data) {
        const { bookmark, isNew } = (result as any).data;
        addBookmarkToStore(bookmark);

        if (isNew) {
          toastStore.show(`Bookmark added: ${bookmark.title}`, 'success');
        } else {
          toastStore.show(`Bookmark moved to top: ${bookmark.title}`, 'info');
        }
      } else {
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
    padding: 15px;
    border-bottom: 1px solid #3e3e42;
    cursor: pointer;
    user-select: none;
  }

  .section-header:hover {
    background-color: #2d2d30;
  }

  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #cccccc;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .add-bookmark-btn {
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 3px;
    width: 24px;
    height: 24px;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
    padding: 0;
    line-height: 1;
  }

  .add-bookmark-btn:hover {
    background-color: #005a9e;
  }

  .toggle-icon {
    font-size: 10px;
    color: #808080;
  }
</style>
