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
    padding: var(--space-5);
    overflow-y: auto;
    max-height: 300px;
  }

  .empty-state {
    padding: var(--space-9);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-sm);
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    padding: var(--space-5);
    margin-bottom: var(--space-2);
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .bookmark-item:hover {
    background-color: var(--bg-hover);
  }

  .bookmark-content {
    flex: 1;
    cursor: pointer;
    min-width: 0;
  }

  .bookmark-title {
    display: block;
    font-size: var(--text-md);
    color: var(--text-primary);
    margin-bottom: var(--space-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bookmark-url {
    display: block;
    font-size: 0.6875rem;
    color: var(--accent-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    margin-left: var(--space-4);
    background-color: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-xl);
    line-height: var(--leading-tight);
    cursor: pointer;
    transition: all var(--transition-fast);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .delete-btn:hover {
    background-color: var(--danger-red);
    border-color: var(--danger-red);
    color: var(--text-bright);
  }

  /* Scrollbar styling */
  .bookmark-list::-webkit-scrollbar {
    width: var(--space-4);
  }

  .bookmark-list::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .bookmark-list::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: var(--radius-md);
  }

  .bookmark-list::-webkit-scrollbar-thumb:hover {
    background: var(--bg-hover);
  }
</style>
