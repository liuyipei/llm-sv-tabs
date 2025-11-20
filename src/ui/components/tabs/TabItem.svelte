<script lang="ts">
  import { getContext } from 'svelte';
  import { activeTabId, selectedTabs, toggleTabSelection } from '$stores/tabs';
  import type { Tab } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  export let tab: Tab;

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

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

  function handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    showContextMenu = true;

    // Close menu when clicking outside
    const closeMenu = () => {
      showContextMenu = false;
      document.removeEventListener('click', closeMenu);
    };
    // Delay to prevent immediate close
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  async function handleReload(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    showContextMenu = false;
    if (ipc) {
      await ipc.reloadTab(tab.id);
    }
  }

  async function handleCopyUrl(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    showContextMenu = false;
    try {
      await navigator.clipboard.writeText(tab.url);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  }

  function handleCloseFromMenu(event: MouseEvent): void {
    event.stopPropagation();
    showContextMenu = false;
    handleClose(event);
  }
</script>

<div
  class="tab-item"
  class:active={isActive}
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  role="button"
  tabindex="0"
>
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

{#if showContextMenu}
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
    role="menu"
  >
    <button class="context-menu-item" on:click={handleReload} role="menuitem">
      Reload Tab
    </button>
    <button class="context-menu-item" on:click={handleCopyUrl} role="menuitem">
      Copy URL
    </button>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item danger" on:click={handleCloseFromMenu} role="menuitem">
      Close Tab
    </button>
  </div>
{/if}

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

  .context-menu {
    position: fixed;
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    min-width: 150px;
    padding: 4px 0;
  }

  .context-menu-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: #d4d4d4;
    padding: 8px 16px;
    text-align: left;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .context-menu-item:hover {
    background-color: #3e3e42;
  }

  .context-menu-item.danger:hover {
    background-color: #e81123;
    color: white;
  }

  .context-menu-divider {
    height: 1px;
    background-color: #3e3e42;
    margin: 4px 0;
  }
</style>
