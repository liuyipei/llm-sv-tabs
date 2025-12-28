<script lang="ts">
  import type { ExperimentTab } from '../types';

  export let tabs: ExperimentTab[] = [];
  export let activeTabId: string | null = null;
  export let onSelect: (id: string) => void;
</script>

<div class="tab-list">
  {#if !tabs.length}
    <div class="empty">No experiment tabs loaded.</div>
  {:else}
    {#each tabs as tab}
      <button class={`tab-tile ${tab.tab_id === activeTabId ? 'active' : ''}`} on:click={() => onSelect(tab.tab_id)}>
        <div class="title">{tab.title}</div>
        <div class="scenario">{tab.scenario}</div>
        <div class="meta">
          <span class="pill">capability: {tab.controls.capabilityPath}</span>
          <span class="pill">max: {tab.controls.maxTokens} tokens</span>
        </div>
      </button>
    {/each}
  {/if}
</div>

<style>
  .tab-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tab-tile {
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #39424c;
    background: #0f141b;
    color: #f8fafc;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .tab-tile.active {
    border-color: #61dafb;
    box-shadow: 0 0 0 1px rgba(97, 218, 251, 0.4);
  }

  .title {
    font-weight: 700;
    margin-bottom: 2px;
  }

  .scenario {
    color: #cbd5e1;
    margin-bottom: 6px;
  }

  .meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pill {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(97, 218, 251, 0.14);
    color: #e2f3ff;
  }

  .empty {
    color: #cbd5e1;
    font-size: 14px;
    padding: 10px;
    border: 1px dashed #334155;
    border-radius: 6px;
  }
</style>
