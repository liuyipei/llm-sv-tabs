<script>
  import BookmarkList from './BookmarkList.svelte';
  import { bookmarksCollapsed } from '$stores/ui';

  function toggleBookmarks() {
    bookmarksCollapsed.update((collapsed) => !collapsed);
  }
</script>

<div class="bookmarks-section">
  <div class="section-header" on:click={toggleBookmarks} role="button" tabindex="0">
    <h2>Bookmarks</h2>
    <span class="toggle-icon">{$bookmarksCollapsed ? '▶' : '▼'}</span>
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

  .toggle-icon {
    font-size: 10px;
    color: #808080;
  }
</style>
