<script lang="ts">
  import { getContext } from 'svelte';
  import { activeTabId, selectedTabs, toggleTabSelection } from '$stores/tabs';
  import { addBookmark } from '$stores/bookmarks';
  import { toastStore } from '$stores/toast';
  import type { Tab } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  let { tab }: { tab: Tab } = $props();

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let isEditing = $state(false);
  let editingTitle = $state('');
  let titleInputElement = $state<HTMLInputElement | null>(null);

  const isActive = $derived(tab.id === $activeTabId);
  const isSelected = $derived($selectedTabs.has(tab.id));
  const isLLMResponse = $derived(tab.metadata?.isLLMResponse === true);
  const isNoteTab = $derived(tab.component === 'note');
  const isEditableTitle = $derived(isLLMResponse || isNoteTab);

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

  async function handleViewRawFromMenu(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    showContextMenu = false;
    if (ipc) {
      await ipc.openRawMessageViewer(tab.id);
    }
  }

  async function handleRefreshClick(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (ipc) {
      await ipc.reloadTab(tab.id);
    }
  }

  async function handleViewRawClick(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (ipc) {
      await ipc.openRawMessageViewer(tab.id);
    }
  }

  async function handleDebugInfoClick(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (ipc) {
      await ipc.openDebugInfoWindow(tab.id);
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

  async function handleAddBookmark(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    showContextMenu = false;
    try {
      const bookmarkInput = {
        title: tab.title || 'Untitled',
        url: tab.url,
      };

      if (ipc) {
        const result = await ipc.addBookmark(bookmarkInput);

        if ((result as any)?.success && (result as any)?.data) {
          const { bookmark, isNew } = (result as any).data;
          addBookmark(bookmark);

          if (isNew) {
            toastStore.show(`Bookmark added: ${bookmark.title}`, 'success');
          } else {
            toastStore.show(`Bookmark moved to top: ${bookmark.title}`, 'info');
          }
        } else {
          toastStore.show('Failed to add bookmark', 'error');
        }
      } else {
        // Fallback when IPC is not available (shouldn't happen in normal use)
        addBookmark(bookmarkInput);
        toastStore.show(`Bookmark added: ${bookmarkInput.title}`, 'success');
      }
    } catch (error) {
      console.error('Failed to add bookmark:', error);
      toastStore.show('Failed to add bookmark', 'error');
    }
  }

  function handleCloseFromMenu(event: MouseEvent): void {
    event.stopPropagation();
    showContextMenu = false;
    handleClose(event);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  function handleTitleDoubleClick(event: MouseEvent): void {
    if (!isEditableTitle) return; // Only allow editing LLM response and note tab titles
    event.stopPropagation();
    isEditing = true;
    editingTitle = tab.title || '';
    // Focus the input after it's rendered
    setTimeout(() => {
      titleInputElement?.focus();
      titleInputElement?.select();
    }, 0);
  }

  async function saveTitle(): Promise<void> {
    if (!isEditing) return;
    const newTitle = editingTitle.trim();
    if (newTitle && newTitle !== tab.title && ipc) {
      await ipc.updateTabTitle(tab.id, newTitle);
    }
    isEditing = false;
  }

  function cancelEditing(): void {
    isEditing = false;
    editingTitle = '';
  }

  function handleTitleInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  function handleTitleInputBlur(): void {
    saveTitle();
  }
</script>

<div
  class="tab-item"
  class:active={isActive}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
>
  <div class="tab-main-row">
    <input
      type="checkbox"
      checked={isSelected}
      onchange={handleCheckboxChange}
      onclick={(e) => e.stopPropagation()}
    />

    <div class="tab-content">
      {#if isEditing}
        <input
          bind:this={titleInputElement}
          bind:value={editingTitle}
          class="tab-title-input"
          type="text"
          onkeydown={handleTitleInputKeydown}
          onblur={handleTitleInputBlur}
          onclick={(e) => e.stopPropagation()}
        />
      {:else}
        <div
          class="tab-title"
          class:editable={isEditableTitle}
          title={isEditableTitle ? `${tab.title} (double-click to edit)` : tab.title}
          ondblclick={handleTitleDoubleClick}
          role={isEditableTitle ? 'button' : undefined}
        >
          {tab.title || 'Untitled'}
        </div>
      {/if}
      <div class="tab-url" title={tab.url}>
        {tab.url}
      </div>
    </div>

    {#if isLLMResponse}
      <button class="refresh-btn view-raw-btn" onclick={handleViewRawClick} title="View raw message">
        📄
      </button>
      <button class="refresh-btn debug-info-btn" onclick={handleDebugInfoClick} title="Debug info (opens in new window)">
        🐛
      </button>
    {:else if !isNoteTab}
      <button class="refresh-btn" onclick={handleRefreshClick} title="Reload tab (Ctrl+R)">
        ↻
      </button>
    {/if}

    <button class="close-btn" onclick={handleClose} title="Close tab (Ctrl+W)">
      ×
    </button>
  </div>
</div>

{#if showContextMenu}
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
    role="menu"
  >
    {#if isLLMResponse}
      <button class="context-menu-item" onclick={handleViewRawFromMenu} role="menuitem">
        View Raw Message
      </button>
    {:else}
      <button class="context-menu-item" onclick={handleReload} role="menuitem">
        Reload Tab
      </button>
    {/if}
    <button class="context-menu-item" onclick={handleCopyUrl} role="menuitem">
      Copy URL
    </button>
    <button class="context-menu-item" onclick={handleAddBookmark} role="menuitem">
      Add to Bookmarks
    </button>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item danger" onclick={handleCloseFromMenu} role="menuitem">
      Close Tab
    </button>
  </div>
{/if}

<style>
  .tab-item {
    padding: 6px 8px;
    margin-bottom: 3px;
    background-color: #2d2d30;
    border-radius: 3px;
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

  .tab-main-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  input[type='checkbox'] {
    flex-shrink: 0;
    cursor: pointer;
    margin: 0;
  }

  .tab-content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .tab-title {
    font-size: 12px;
    font-weight: 500;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .tab-title.editable {
    cursor: text;
  }

  .tab-title.editable:hover {
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
    padding: 1px 2px;
    margin: -1px -2px;
  }

  .tab-title-input {
    font-size: 12px;
    font-weight: 500;
    color: #d4d4d4;
    background-color: #3c3c3c;
    border: 1px solid #007acc;
    border-radius: 2px;
    padding: 1px 4px;
    margin-bottom: 2px;
    width: 100%;
    outline: none;
  }

  .tab-url {
    font-size: 10px;
    color: #808080;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .refresh-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #d4d4d4;
    font-size: 16px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    opacity: 1;
    background-color: #007acc;
  }

  .close-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #d4d4d4;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    border-radius: 3px;
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
