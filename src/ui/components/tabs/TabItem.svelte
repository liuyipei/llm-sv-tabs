<script lang="ts">
  import { getContext } from 'svelte';
  import { activeTabId, selectedTabs, toggleTabSelection } from '$stores/tabs';
  import type { Tab } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  export let tab: Tab;

  const ipc = getContext<IPCBridgeAPI>('ipc');

  $: isActive = tab.id === $activeTabId;
  $: isSelected = $selectedTabs.has(tab.id);

  function handleClick(): void {
    if (ipc) {
      ipc.setActiveTab(tab.id);
    }
  }

  function handleClose(event: MouseEvent): void {
    event.stopPropagation();
    if (ipc) {
      ipc.closeTab(tab.id);
    }
  }

  function handleCheckboxChange(): void {
    toggleTabSelection(tab.id);
  }
</script>

<div class="tab-item" class:active={isActive} on:click={handleClick} role="button" tabindex="0">
  <input
    type="checkbox"
    checked={isSelected}
    on:change={handleCheckboxChange}
    on:click={(e) => e.stopPropagation()}
  />

  <div class="tab-content">
    <div class="tab-title" title={tab.title}>
      {tab.title || 'Untitled'}
    </div>
    <div class="tab-url" title={tab.url}>
      {tab.url}
    </div>
  </div>

  <button class="close-btn" on:click={handleClose} title="Close tab">
    ×
  </button>
</div>

<style>
  .tab-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    margin-bottom: 5px;
    background-color: #2d2d30;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .tab-item:hover {
    background-color: #3e3e42;
  }

  .tab-item.active {
    background-color: #094771;
    border-left: 3px solid #007acc;
  }

  input[type='checkbox'] {
    flex-shrink: 0;
    cursor: pointer;
  }

  .tab-content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .tab-title {
    font-size: 13px;
    font-weight: 500;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }

  .tab-url {
    font-size: 11px;
    color: #808080;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #d4d4d4;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.2s;
  }

  .close-btn:hover {
    opacity: 1;
    background-color: #e81123;
  }
</style>
