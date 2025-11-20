<script lang="ts">
  import { setContext, onMount } from 'svelte';
  import { initializeIPC, type IPCBridgeAPI } from '$lib/ipc-bridge';
  import TabsSection from '$components/tabs/TabsSection.svelte';
  import BookmarksSection from '$components/bookmarks/BookmarksSection.svelte';
  import ChatContainer from '$components/chat/ChatContainer.svelte';
  import InputControls from '$components/chat/InputControls.svelte';
  import { menuCollapsed } from '$stores/ui';

  // Initialize IPC and make it available to all child components
  let ipc: IPCBridgeAPI;

  onMount(() => {
    ipc = initializeIPC();
    setContext('ipc', ipc);
  });

  function toggleMenu(): void {
    menuCollapsed.update((collapsed) => !collapsed);
  }
</script>

<main class="app-container">
  <header class="app-header">
    <div class="header-left">
      <button class="menu-toggle" on:click={toggleMenu}>☰</button>
      <h1>LLM Browser</h1>
    </div>
  </header>

  <div class="app-content" class:menu-collapsed={$menuCollapsed}>
    <aside class="sidebar" class:collapsed={$menuCollapsed}>
      <TabsSection />
      <BookmarksSection />
    </aside>

    <section class="main-content">
      <InputControls />
      <ChatContainer />
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
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .app-header {
    background-color: #252526;
    padding: 10px 20px;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }

  .menu-toggle {
    background: none;
    border: none;
    color: #d4d4d4;
    font-size: 24px;
    cursor: pointer;
    padding: 5px 10px;
    border-radius: 4px;
  }

  .menu-toggle:hover {
    background-color: #3e3e42;
  }

  .app-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 300px;
    background-color: #252526;
    border-right: 1px solid #3e3e42;
    overflow-y: auto;
    transition: width 0.3s ease;
  }

  .sidebar.collapsed {
    width: 0;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
