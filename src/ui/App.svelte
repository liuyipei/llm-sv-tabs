<script lang="ts">
  import { setContext, onMount } from 'svelte';
  import { initializeIPC, type IPCBridgeAPI } from '$lib/ipc-bridge';
  import TabsSection from '$components/tabs/TabsSection.svelte';
  import BookmarksSection from '$components/bookmarks/BookmarksSection.svelte';
  import ChatView from '$components/chat/ChatView.svelte';
  import UrlBar from '$components/chat/UrlBar.svelte';
  import SearchBar from '$components/chat/SearchBar.svelte';
  import LLMControls from '$components/llm/LLMControls.svelte';
  import NotesSection from '$components/notes/NotesSection.svelte';
  import ResizableDivider from '$components/ResizableDivider.svelte';
  import MessageStream from '$components/chat/MessageStream.svelte';
  import ApiKeyInstructionsView from '$components/llm/ApiKeyInstructionsView.svelte';
  import NoteEditor from '$components/notes/NoteEditor.svelte';
  import { activeSidebarView, sidebarTabsHeightPercent } from '$stores/ui';
  import { activeTabId, activeTabs, sortedTabs } from '$stores/tabs';
  import { addBookmark as addBookmarkToStore } from '$stores/bookmarks';
  import { initKeyboardShortcuts } from '$utils/keyboard-shortcuts';

  // Import styles for markdown rendering
  import '~/highlight.js/styles/github-dark.css';
  import '~/katex/dist/katex.css';

  // Reactive computed properties
  $: activeTab = $activeTabId ? $activeTabs.get($activeTabId) : null;
  $: showSvelteContent = activeTab?.component === 'llm-response';
  $: showApiKeyInstructions = activeTab?.component === 'api-key-instructions';
  $: showNoteEditor = activeTab?.component === 'note';

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

  function setView(view: 'chat' | 'settings' | 'bookmarks' | 'notes'): void {
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
      });
      const bookmark = (result as any)?.data || { title: activeTab.title, url: activeTab.url };
      addBookmarkToStore(bookmark);
      console.log('Bookmark added:', activeTab.title);
    } catch (error) {
      console.error('Failed to bookmark tab:', error);
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

  // Global drag and drop handler to open files in tabs
  function handleGlobalDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleGlobalDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Process all files in parallel
    const fileArray = Array.from(files);
    const promises = fileArray.map(file => processDroppedFile(file));

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Error processing dropped files:', error);
    }
  }

  async function processDroppedFile(file: File): Promise<void> {
    const fileType = detectFileType(file);
    const filePath = ipc?.getPathForFile?.(file);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (ipc) {
        try {
          await ipc.openNoteTab(Date.now(), file.name, content, fileType, filePath);
        } catch (error) {
          console.error('Failed to create tab for dropped file:', error);
        }
      }
    };

    if (fileType === 'image' || fileType === 'pdf') {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  function detectFileType(file: File): 'text' | 'pdf' | 'image' {
    const mimeType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(fileName)) {
      return 'image';
    }

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'pdf';
    }

    return 'text';
  }

  // Initialize keyboard shortcuts on mount
  onMount(() => {
    const cleanup = initKeyboardShortcuts({
      focusUrlInput,
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

    // Set up IPC listener for focus-url-bar event (triggered by global shortcut)
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onFocusUrlBar(() => {
        focusUrlInput();
      });

      // Set up IPC listener for focus-search-bar event (triggered by Ctrl+F global shortcut)
      window.electronAPI.onFocusSearchBar(() => {
        showSearchBar();
      });

      if (window.electronAPI.onFocusLLMInput) {
        window.electronAPI.onFocusLLMInput(() => {
          focusLLMInput();
        });
      }


      // Set up IPC listeners for tab navigation using sorted order
      if (window.electronAPI.onNavigateNextTab) {
        window.electronAPI.onNavigateNextTab(() => {
          navigateToNextTab();
        });
      }

      if (window.electronAPI.onNavigatePreviousTab) {
        window.electronAPI.onNavigatePreviousTab(() => {
          navigateToPreviousTab();
        });
      }

      // Handle bookmark shortcut from browser view
      if (window.electronAPI.onBookmarkTab) {
        window.electronAPI.onBookmarkTab(() => {
          bookmarkActiveTab();
        });
      }

      // Handle screenshot shortcut from browser view
      if (window.electronAPI.onTriggerScreenshot) {
        window.electronAPI.onTriggerScreenshot(() => {
          ipc.triggerScreenshot();
        });
      }
    }

    // Cleanup on unmount
    return cleanup;
  });
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<main class="app-container" ondragover={handleGlobalDragOver} ondrop={handleGlobalDrop}>
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

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background-color: #1e1e1e;
    color: #d4d4d4;
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
    width: 350px;
    min-width: 350px;
    max-width: 350px;
    flex-shrink: 0;
    background-color: #252526;
    border-right: 1px solid #3e3e42;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-nav {
    display: flex;
    gap: 5px;
    padding: 10px;
    background-color: #2d2d30;
    border-bottom: 1px solid #3e3e42;
  }

  .nav-btn {
    flex: 1;
    background-color: #3e3e42;
    color: #d4d4d4;
    border: none;
    border-radius: 4px;
    padding: 8px;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
  }

  .nav-btn:hover {
    background-color: #4e4e52;
  }

  .nav-btn.active {
    background-color: #007acc;
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
    background-color: #1e1e1e;
    overflow-y: auto;
  }

  .browser-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #808080;
    text-align: center;
  }

  .browser-placeholder p {
    margin: 5px 0;
    font-size: 16px;
  }

  .browser-placeholder .hint {
    font-size: 14px;
    color: #606060;
  }
</style>
