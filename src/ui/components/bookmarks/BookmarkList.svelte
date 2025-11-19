<script>
  import { getContext, onMount } from 'svelte';

  const ipc = getContext('ipc');
  let bookmarks = [];

  onMount(async () => {
    if (ipc) {
      bookmarks = await ipc.getBookmarks();
    }
  });
</script>

<div class="bookmark-list">
  {#if bookmarks.length === 0}
    <div class="empty-state">
      <p>No bookmarks yet</p>
    </div>
  {:else}
    {#each bookmarks as bookmark (bookmark.id)}
      <div class="bookmark-item">
        <span class="bookmark-title">{bookmark.title}</span>
        <a href={bookmark.url} class="bookmark-url" target="_blank" rel="noopener noreferrer">
          {bookmark.url}
        </a>
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
    padding: 10px;
    margin-bottom: 5px;
    background-color: #2d2d30;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .bookmark-item:hover {
    background-color: #3e3e42;
  }

  .bookmark-title {
    display: block;
    font-size: 13px;
    color: #d4d4d4;
    margin-bottom: 3px;
  }

  .bookmark-url {
    display: block;
    font-size: 11px;
    color: #007acc;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bookmark-url:hover {
    text-decoration: underline;
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
