<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { bookmarks, removeBookmark } from '$stores/bookmarks';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { Bookmark } from '../../../types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  // Load bookmarks from main process on mount
  onMount(async () => {
    if (ipc) {
      const result = await ipc.getBookmarks();
      const loadedBookmarks = Array.isArray(result) ? result : (result.data || []);
      if (loadedBookmarks.length > 0) {
        bookmarks.set(loadedBookmarks);
      }
    }
  });

  async function handleDelete(id: string) {
    if (ipc) {
      const result = await ipc.deleteBookmark(id);
      if (result.success || result.success === undefined) {
        removeBookmark(id);
      }
    } else {
      removeBookmark(id);
    }
  }

  async function handleOpen(bookmark: Bookmark) {
    if (ipc) {
      // Use openBookmark to properly handle file-based bookmarks (PDFs, images, text)
      await ipc.openBookmark(bookmark);
    }
  }
</script>

<div class="bookmark-list">
  {#if $bookmarks.length === 0}
    <div class="empty-state">
      <p>No bookmarks yet</p>
    </div>
  {:else}
    {#each $bookmarks as bookmark (bookmark.id)}
      <div class="bookmark-item">
        <div class="bookmark-content" onclick={() => handleOpen(bookmark)} onkeydown={(e) => e.key === 'Enter' && handleOpen(bookmark)} role="button" tabindex="0">
          <span class="bookmark-title">{bookmark.title}</span>
          <span class="bookmark-url">{bookmark.url}</span>
        </div>
        <button class="delete-btn" onclick={() => handleDelete(bookmark.id)} title="Delete bookmark">×</button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .bookmark-list {
    padding: 10px;
    overflow-y: auto;
    max-height: 300px;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #808080;
    font-size: 12px;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    padding: 10px;
    margin-bottom: 5px;
    background-color: #2d2d30;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .bookmark-item:hover {
    background-color: #3e3e42;
  }

  .bookmark-content {
    flex: 1;
    cursor: pointer;
    min-width: 0;
  }

  .bookmark-title {
    display: block;
    font-size: 13px;
    color: #d4d4d4;
    margin-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bookmark-url {
    display: block;
    font-size: 11px;
    color: #007acc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-left: 8px;
    background-color: transparent;
    border: 1px solid #555;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .delete-btn:hover {
    background-color: #c72e2e;
    border-color: #c72e2e;
    color: white;
  }

  /* Scrollbar styling */
  .bookmark-list::-webkit-scrollbar {
    width: 8px;
  }

  .bookmark-list::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  .bookmark-list::-webkit-scrollbar-thumb {
    background: #3e3e42;
    border-radius: 4px;
  }

  .bookmark-list::-webkit-scrollbar-thumb:hover {
    background: #4e4e52;
  }
</style>
