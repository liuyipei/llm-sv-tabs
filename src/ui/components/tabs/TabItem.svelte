<script lang="ts">
  import { getContext } from 'svelte';
  import { activeTabId, selectedTabs, toggleTabSelection } from '$stores/tabs';
  import { addBookmark } from '$stores/bookmarks';
  import { toastStore } from '$stores/toast';
  import type { Tab } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import { applyBookmarkResult, handleBookmarkResponse } from '$lib/bookmark-results';

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
        url: tab.metadata?.noteId !== undefined ? `note://${tab.metadata.noteId}` : tab.url,
        // Include file metadata for file-based bookmarks (PDFs, images, text files)
        filePath: tab.metadata?.filePath,
        fileType: tab.metadata?.fileType,
        noteId: tab.metadata?.noteId,
        noteContent: tab.metadata?.noteContent,
      };

      if (ipc) {
        const result = await ipc.addBookmark(bookmarkInput);

        if (!handleBookmarkResponse(result)) {
          toastStore.show('Failed to add bookmark', 'error');
        }
      } else {
        // Fallback when IPC is not available (shouldn't happen in normal use)
        const result = addBookmark(bookmarkInput);
        applyBookmarkResult(result);
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
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-1);
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-default);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .tab-item:hover {
    background-color: var(--bg-hover);
  }

  .tab-item.active {
    background-color: var(--bg-active);
    border-left: 3px solid var(--accent-color);
  }

  .tab-main-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
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
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: var(--space-1);
  }

  .tab-title.editable {
    cursor: text;
  }

  .tab-title.editable:hover {
    background-color: var(--bg-hover-subtle);
    border-radius: var(--radius-sm);
    padding: 1px 2px;
    margin: -1px -2px;
  }

  .tab-title-input {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    background-color: var(--bg-input);
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-sm);
    padding: 1px var(--space-2);
    margin-bottom: var(--space-1);
    width: 100%;
    outline: none;
  }

  .tab-url {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .refresh-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--text-lg);
    cursor: pointer;
    padding: 0;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-default);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all var(--transition-fast);
  }

  .refresh-btn:hover {
    opacity: 1;
    background-color: var(--accent-color);
  }

  .close-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--text-xl);
    cursor: pointer;
    padding: 0;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-default);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    opacity: 1;
    background-color: var(--danger-red);
  }

  .context-menu {
    position: fixed;
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: var(--z-modal);
    min-width: 150px;
    padding: var(--space-2) 0;
  }

  .context-menu-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: var(--text-primary);
    padding: var(--space-4) var(--space-8);
    text-align: left;
    font-size: var(--text-md);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .context-menu-item:hover {
    background-color: var(--bg-hover);
  }

  .context-menu-item.danger:hover {
    background-color: var(--danger-red);
    color: var(--text-bright);
  }

  .context-menu-divider {
    height: 1px;
    background-color: var(--border-color);
    margin: var(--space-2) 0;
  }
</style>
