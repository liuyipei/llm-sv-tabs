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
    padding: var(--space-4);
  }

  .empty-state {
    padding: var(--space-9) var(--space-7);
    text-align: center;
    color: var(--text-tertiary);
  }

  .empty-state p {
    margin: var(--space-2) 0;
  }

  .empty-state .hint {
    font-size: var(--text-sm);
    color: var(--text-disabled);
  }

  /* Scrollbar styling */
  .tab-list::-webkit-scrollbar {
    width: var(--space-4);
  }

  .tab-list::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .tab-list::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: var(--radius-md);
  }

  .tab-list::-webkit-scrollbar-thumb:hover {
    background: var(--bg-hover);
  }
</style>
