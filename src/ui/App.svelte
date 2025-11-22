<script lang="ts">
  import { setContext } from 'svelte';
  import { initializeIPC, type IPCBridgeAPI } from '$lib/ipc-bridge';
  import TabsSection from '$components/tabs/TabsSection.svelte';
  import BookmarksSection from '$components/bookmarks/BookmarksSection.svelte';
  import ChatView from '$components/chat/ChatView.svelte';
  import UrlBar from '$components/chat/UrlBar.svelte';
  import LLMControls from '$components/llm/LLMControls.svelte';
  import NotesSection from '$components/notes/NotesSection.svelte';
  import { activeSidebarView } from '$stores/ui';

  // Import styles for markdown rendering
  import '~/highlight.js/styles/github-dark.css';
  import '~/katex/dist/katex.css';

  // Initialize IPC and make it available to all child components
  const ipc: IPCBridgeAPI = initializeIPC();
  setContext('ipc', ipc);

  function setView(view: 'chat' | 'settings' | 'bookmarks' | 'notes'): void {
    activeSidebarView.set(view);
  }
</script>

<main class="app-container">
  <div class="app-content">
    <aside class="sidebar">
      <div class="sidebar-nav">
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'chat'}
          onclick={() => setView('chat')}
          title="LLM Conversation"
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
          title="Bookmarks"
        >
          ⭐
        </button>
        <button
          class="nav-btn"
          class:active={$activeSidebarView === 'notes'}
          onclick={() => setView('notes')}
          title="Notes & Files"
        >
          📝
        </button>
      </div>

      <div class="sidebar-content">
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

      <div class="sidebar-tabs">
        <TabsSection />
      </div>
    </aside>

    <section class="main-content">
      <UrlBar />
      <div class="browser-view">
        <div class="browser-placeholder">
          <p>Browser content will appear here</p>
          <p class="hint">Enter a URL above to open a new tab</p>
        </div>
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
    padding: 10px;
    font-size: 20px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover {
    background-color: #4e4e52;
  }

  .nav-btn.active {
    background-color: #007acc;
    transform: scale(1.05);
  }

  .sidebar-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebar-tabs {
    height: 250px;
    border-top: 1px solid #3e3e42;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .main-content {
    flex: 1;
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
