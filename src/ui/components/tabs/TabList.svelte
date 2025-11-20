<script lang="ts">
  import { sortedTabs } from '$stores/tabs';
  import TabItem from './TabItem.svelte';
</script>

<div class="tab-list">
  {#if $sortedTabs.length === 0}
    <div class="empty-state">
      <p>No tabs open</p>
      <p class="hint">Enter a URL to open a new tab</p>
    </div>
  {:else}
    {#each $sortedTabs as tab (tab.id)}
      <TabItem {tab} />
    {/each}
  {/if}
</div>

<style>
  .tab-list {
    flex: 1;
    overflow-y: auto;
    padding: 5px;
  }

  .empty-state {
    padding: 30px 20px;
    text-align: center;
    color: #808080;
  }

  .empty-state p {
    margin: 5px 0;
  }

  .empty-state .hint {
    font-size: 12px;
    color: #606060;
  }

  /* Scrollbar styling */
  .tab-list::-webkit-scrollbar {
    width: 8px;
  }

  .tab-list::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  .tab-list::-webkit-scrollbar-thumb {
    background: #3e3e42;
    border-radius: 4px;
  }

  .tab-list::-webkit-scrollbar-thumb:hover {
    background: #4e4e52;
  }
</style>
