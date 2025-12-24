<script lang="ts">
  import { setContext, onMount } from 'svelte';
  import { initializeIPC, type IPCBridgeAPI } from '$lib/ipc-bridge';
  import TabsSection from '$components/tabs/TabsSection.svelte';
  import BookmarksSection from '$components/bookmarks/BookmarksSection.svelte';
  import ChatView from '$components/chat/ChatView.svelte';
  import UrlBar from '$components/chat/UrlBar.svelte';
  import SearchBar from '$components/chat/SearchBar.svelte';
  import KeyboardShortcutsPanel from '$components/common/KeyboardShortcutsPanel.svelte';
  import LLMControls from '$components/llm/LLMControls.svelte';
  import NotesSection from '$components/notes/NotesSection.svelte';
  import ResizableDivider from '$components/ResizableDivider.svelte';
  import MessageStream from '$components/chat/MessageStream.svelte';
  import ApiKeyInstructionsView from '$components/llm/ApiKeyInstructionsView.svelte';
  import NoteEditor from '$components/notes/NoteEditor.svelte';
  import AggregateTabs from '$components/tabs/AggregateTabs.svelte';
  import Toast from '$components/Toast.svelte';
  import { activeSidebarView, sidebarTabsHeightPercent } from '$stores/ui';
  import { activeTabId, activeTabs, sortedTabs } from '$stores/tabs';
  import { toastStore } from '$stores/toast';
  import { loadCapabilitiesFromCache } from '$stores/capabilities';
  import { handleBookmarkResponse } from '$lib/bookmark-results';
  import { initKeyboardShortcuts } from '$utils/keyboard-shortcuts';
  import { handleDragOver, handleDrop } from '$utils/file-drop-handler';
  import { setupElectronListeners } from '$utils/electron-listeners';

  // Import styles for markdown rendering
  import '~/highlight.js/styles/github-dark.css';
  import '~/katex/dist/katex.css';

  // Reactive computed properties
  $: activeTab = $activeTabId ? $activeTabs.get($activeTabId) : null;
  $: showSvelteContent = activeTab?.component === 'llm-response';
  $: showApiKeyInstructions = activeTab?.component === 'api-key-instructions';
  $: showNoteEditor = activeTab?.component === 'note';
  $: showAggregateTabs = activeTab?.component === 'aggregate-tabs';

  // Initialize IPC and make it available to all child components
  const ipc: IPCBridgeAPI = initializeIPC();
  setContext('ipc', ipc);

  // Input focus callbacks (will be set by child components)
  let focusUrlInputCallback: (() => void) | null = null;
  let focusLLMInputCallback: (() => void) | null = null;

  // Search bar state
  let searchBarVisible = false;
  let searchBarComponent: SearchBar;

  function setFocusUrlInputCallback(callback: () => void): void {
    focusUrlInputCallback = callback;
  }

  function setFocusLLMInputCallback(callback: () => void): void {
    focusLLMInputCallback = callback;
  }

  setContext('setFocusUrlInputCallback', setFocusUrlInputCallback);
  setContext('setFocusLLMInputCallback', setFocusLLMInputCallback);

  function setView(view: 'chat' | 'settings' | 'bookmarks' | 'notes' | 'shortcuts'): void {
    activeSidebarView.set(view);
  }

  function handleSidebarResize(percentage: number): void {
    sidebarTabsHeightPercent.set(percentage);
  }

  // Keyboard shortcut actions
  function focusUrlInput(): void {
    if (focusUrlInputCallback) {
      focusUrlInputCallback();
    }
  }

  function focusLLMInput(): void {
    // Switch to chat view
    activeSidebarView.set('chat');
    // Focus the input
    if (focusLLMInputCallback) {
      focusLLMInputCallback();
    }
  }

  async function closeActiveTab(): Promise<void> {
    const currentActiveTabId = $activeTabId;
    if (currentActiveTabId && ipc) {
      try {
        await ipc.closeTab(currentActiveTabId);
      } catch (error) {
        console.error('Failed to close active tab:', error);
      }
    }
  }

  async function bookmarkActiveTab(): Promise<void> {
    const currentActiveTabId = $activeTabId;
    if (!currentActiveTabId || !ipc) return;

    // Find the active tab
    const activeTab = $sortedTabs.find((tab) => tab.id === currentActiveTabId);
    if (!activeTab) return;

    try {
      const result = await ipc.addBookmark({
        title: activeTab.title,
        url: activeTab.url,
        // Include file metadata for file-based bookmarks (PDFs, images, text files)
        filePath: activeTab.metadata?.filePath,
        fileType: activeTab.metadata?.fileType,
      });

      if (!handleBookmarkResponse(result)) {
        toastStore.show('Failed to add bookmark', 'error');
      }
    } catch (error) {
      console.error('Failed to bookmark tab:', error);
      toastStore.show('Failed to add bookmark', 'error');
    }
  }

  function toggleSearchBar(): void {
    searchBarVisible = !searchBarVisible;
    // Notify main process about search bar visibility to adjust WebContentsView bounds
    if (ipc) {
      ipc.setSearchBarVisible(searchBarVisible);
    }
    if (searchBarVisible && searchBarComponent) {
      searchBarComponent.focus();
    }
  }

  function showSearchBar(): void {
    if (!searchBarVisible) {
      searchBarVisible = true;
      if (ipc) {
        ipc.setSearchBarVisible(true);
      }
    }
    if (searchBarComponent) {
      searchBarComponent.focus();
    }
  }

  function hideSearchBar(): void {
    searchBarVisible = false;
    if (ipc) {
      ipc.setSearchBarVisible(false);
    }
  }

  async function focusWebContentsView(): Promise<void> {
    if (!ipc) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    try {
      const result = await ipc.focusActiveWebContents();
      if ((result as { success?: boolean })?.success === false) {
        console.warn('WebContentsView focus request was not successful:', result);
      }
    } catch (error) {
      console.error('Failed to focus active WebContentsView:', error);
    }
  }

  async function navigateToNextTab(): Promise<void> {
    if (!ipc) return;
    const tabs = $sortedTabs;
    if (tabs.length === 0) return;

    const currentTabId = $activeTabId;
    if (!currentTabId) {
      // No active tab, activate the first one
      await ipc.setActiveTab(tabs[0].id);
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    await ipc.setActiveTab(tabs[nextIndex].id);
  }

  async function navigateToPreviousTab(): Promise<void> {
    if (!ipc) return;
    const tabs = $sortedTabs;
    if (tabs.length === 0) return;

    const currentTabId = $activeTabId;
    if (!currentTabId) {
      // No active tab, activate the last one
      await ipc.setActiveTab(tabs[tabs.length - 1].id);
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
    const previousIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    await ipc.setActiveTab(tabs[previousIndex].id);
  }

  async function reloadActiveTab(): Promise<void> {
    const currentActiveTabId = $activeTabId;
    if (currentActiveTabId && ipc) {
      try {
        await ipc.reloadTab(currentActiveTabId);
      } catch (error) {
        console.error('Failed to reload active tab:', error);
      }
    }
  }

  async function triggerScreenshot(): Promise<void> {
    if (ipc) {
      try {
        await ipc.triggerScreenshot();
      } catch (error) {
        console.error('Failed to trigger screenshot:', error);
      }
    }
  }

  async function goBack(): Promise<void> {
    const currentActiveTabId = $activeTabId;
    if (currentActiveTabId && ipc) {
      try {
        await ipc.goBack(currentActiveTabId);
      } catch (error) {
        console.error('Failed to go back:', error);
      }
    }
  }

  async function goForward(): Promise<void> {
    const currentActiveTabId = $activeTabId;
    if (currentActiveTabId && ipc) {
      try {
        await ipc.goForward(currentActiveTabId);
      } catch (error) {
        console.error('Failed to go forward:', error);
      }
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (isCtrlOrMeta && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.stopPropagation();
      showSearchBar();
      return;
    }

    if (event.key !== 'Escape') return;
    if (event.defaultPrevented) return;

    event.preventDefault();
    focusWebContentsView();
  }

  // Initialize keyboard shortcuts and IPC listeners on mount
  onMount(() => {
    // Load capabilities when window gains focus
    const handleFocus = () => {
      void loadCapabilitiesFromCache();
    };
    window.addEventListener('focus', handleFocus);

    const keyboardCleanup = initKeyboardShortcuts({
      focusUrlInput,
      focusUrlInputFromNewTab: focusUrlInput,
      focusLLMInput,
      closeActiveTab,
      bookmarkActiveTab,
      toggleSearchBar,
      reloadActiveTab,
      triggerScreenshot,
      goBack,
      goForward,
      nextTab: navigateToNextTab,
      previousTab: navigateToPreviousTab,
    });

    const electronCleanup = setupElectronListeners({
      focusUrlInput,
      focusLLMInput,
      showSearchBar,
      navigateToNextTab,
      navigateToPreviousTab,
      bookmarkActiveTab,
      triggerScreenshot,
    });

    // Cleanup on unmount
    return () => {
      window.removeEventListener('focus', handleFocus);
      keyboardCleanup();
      electronCleanup();
    };
  });
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<main class="app-container" ondragover={handleDragOver} ondrop={(e) => handleDrop(e, ipc)}>
  <div class="app-content">
    <aside class="sidebar">
      <div class="sidebar-nav">
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'chat'}
          onclick={() => setView('chat')}
          title="LLM Conversation (Ctrl+. to focus input)"
        >
          💬
        </button>
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'settings'}
          onclick={() => setView('settings')}
          title="LLM Settings"
        >
          ⚙️
        </button>
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'bookmarks'}
          onclick={() => setView('bookmarks')}
          title="Bookmarks (Ctrl+D to bookmark current tab)"
        >
          ⭐
        </button>
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'notes'}
          onclick={() => setView('notes')}
          title="Notes & Files (Ctrl+Alt+S for screenshot)"
        >
          📝
        </button>
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'shortcuts'}
          onclick={() => setView('shortcuts')}
          title="Keyboard shortcuts"
        >
          ⌨️
        </button>
      </div>

      <div class="sidebar-content" style="flex: {100 - $sidebarTabsHeightPercent}">
        {#if $activeSidebarView === 'chat'}
          <ChatView />
        {:else if $activeSidebarView === 'settings'}
          <LLMControls />
        {:else if $activeSidebarView === 'bookmarks'}
          <BookmarksSection />
        {:else if $activeSidebarView === 'notes'}
          <NotesSection />
        {:else if $activeSidebarView === 'shortcuts'}
          <KeyboardShortcutsPanel />
        {/if}
      </div>

      <ResizableDivider onResize={handleSidebarResize} orientation="horizontal" />

      <div class="sidebar-tabs" style="flex: {$sidebarTabsHeightPercent}">
        <TabsSection />
      </div>
    </aside>

    <section class="main-content">
      <UrlBar />
      <SearchBar
        bind:this={searchBarComponent}
        visible={searchBarVisible}
        onClose={hideSearchBar}
      />
      <div class="browser-view">
        {#if showApiKeyInstructions && activeTab}
          <ApiKeyInstructionsView />
        {:else if showNoteEditor && activeTab}
          <NoteEditor tabId={activeTab.id} />
        {:else if showAggregateTabs}
          <AggregateTabs />
        {:else if showSvelteContent && activeTab}
          <MessageStream tabId={activeTab.id} />
        {:else}
          <div class="browser-placeholder">
            <p>Browser content will appear here</p>
            <p class="hint">Enter a URL above to open a new tab</p>
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>

<Toast />

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: var(--font-system);
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  .app-container {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .app-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    max-width: var(--sidebar-width);
    flex-shrink: 0;
    background-color: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-nav {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-5);
    background-color: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
  }

  .nav-btn {
    flex: 1;
    background-color: var(--bg-hover);
    color: var(--text-primary);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-4);
    font-size: var(--text-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    height: 2.25rem;
  }

  .nav-btn:hover {
    background-color: #4e4e52;
  }

  .nav-btn.active {
    background-color: var(--accent-color);
    transform: scale(1.05);
  }

  .sidebar-content {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-tabs {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .main-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .browser-view {
    flex: 1;
    background-color: var(--bg-primary);
    overflow-y: auto;
  }

  .browser-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-tertiary);
    text-align: center;
  }

  .browser-placeholder p {
    margin: var(--space-3) 0;
    font-size: var(--text-lg);
  }

  .browser-placeholder .hint {
    font-size: var(--text-base);
    color: var(--text-disabled);
  }
</style>
