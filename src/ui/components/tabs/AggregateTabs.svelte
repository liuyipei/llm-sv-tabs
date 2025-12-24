<script lang="ts">
  import { getContext, onDestroy, onMount } from 'svelte';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { TabData, TabRegistrySnapshot } from '../../../types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let snapshot = $state<TabRegistrySnapshot | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadRequestId = 0;

  let unsubscribers: Array<() => void> = [];

  async function loadSnapshot(): Promise<void> {
    const requestId = ++loadRequestId;

    if (!ipc?.getTabRegistrySnapshot) {
      error = 'Tab snapshot unavailable in this environment';
      loading = false;
      return;
    }

    loading = true;
    error = null;
    try {
      const response = await ipc.getTabRegistrySnapshot();
      if ('success' in response && response.success === false) {
        error = response.error || 'Failed to load tab snapshot';
        snapshot = null;
      } else {
        const data = 'data' in response ? (response as any).data : response;
        snapshot = data as TabRegistrySnapshot;
      }
    } catch (err) {
      console.error('Failed to load tab registry snapshot', err);
      error = err instanceof Error ? err.message : String(err);
      snapshot = null;
    } finally {
      // Only clear loading for the latest request to avoid flicker on rapid refreshes
      if (requestId === loadRequestId) {
        loading = false;
      }
    }
  }

  function tabIcon(tab: TabData): string {
    if (tab.component === 'llm-response') return '💬';
    if (tab.metadata?.fileType === 'pdf') return '📄';
    if (tab.metadata?.fileType === 'image') return '🖼️';
    if (tab.component === 'note' || tab.metadata?.fileType === 'text') return '📝';
    if (tab.type === 'webpage') return '🌐';
    return '📎';
  }

  async function closeTab(tabId: string): Promise<void> {
    if (!ipc?.closeTab) return;
    try {
      await ipc.closeTab(tabId);
      await loadSnapshot();
    } catch (err) {
      console.error('Failed to close tab from aggregate view', err);
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      refreshTimeout = null;
      void loadSnapshot();
    }, 50);
  }

  function startEventListeners(): void {
    const api = window.electronAPI;
    const listeners = [
      api?.onTabCreated?.(() => scheduleRefresh()),
      api?.onTabUpdated?.(() => scheduleRefresh()),
      api?.onTabClosed?.(() => scheduleRefresh()),
      api?.onActiveTabChanged?.(() => scheduleRefresh()),
    ].filter((fn): fn is () => void => Boolean(fn));

    unsubscribers.push(...listeners);
  }

  function stopEventListeners(): void {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];

    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }
  }

  onMount(() => {
    void loadSnapshot();
    startEventListeners();
  });

  onDestroy(() => {
    stopEventListeners();
  });

  const tabsById = $derived(
    snapshot
      ? new Map(snapshot.tabs.filter((tab) => tab.component !== 'aggregate-tabs').map((tab) => [tab.id, tab]))
      : new Map<string, TabData>()
  );
</script>

<div class="aggregate-tabs">
  {#if loading}
    <div class="state">Loading tab overview…</div>
  {:else if error}
    <div class="state error">Failed to load tabs: {error}</div>
  {:else if !snapshot}
    <div class="state">No snapshot available.</div>
  {:else}
    {#if snapshot.windows.length === 0}
      <div class="state">No windows found.</div>
    {:else}
      {#each snapshot.windows as windowSnapshot (windowSnapshot.id)}
        <div class="window-section">
          <div class="window-header">
            <div class="window-title">Window {windowSnapshot.id}</div>
            {#if windowSnapshot.activeTabId}
              <div class="window-active">Active: {windowSnapshot.activeTabId}</div>
            {/if}
          </div>
          {#if windowSnapshot.tabIds.length === 0}
            <div class="state subtle">No tabs in this window.</div>
          {:else}
            <ul>
              {#each windowSnapshot.tabIds as tabId (tabId)}
                {@const tab = tabsById.get(tabId)}
                {#if tab}
                  <li>
                    <span class="icon" aria-hidden="true">{tabIcon(tab)}</span>
                    <div class="tab-info">
                      <div class="tab-title">{tab.title || tab.url}</div>
                      <div class="tab-meta">{tab.type}{tab.component === 'llm-response' ? ' • conversation' : ''}</div>
                    </div>
                    <button class="close-btn" title="Close tab" onclick={() => closeTab(tab.id)}>
                      ×
                    </button>
                  </li>
                {:else}
                  <li class="state subtle">Tab data unavailable</li>
                {/if}
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .aggregate-tabs {
    padding: 16px;
    color: #e0e0e0;
    overflow: auto;
    height: 100%;
  }

  .state {
    padding: 10px;
    background: #2e2e32;
    border-radius: 6px;
    color: #c0c0c0;
  }

  .state.error {
    background: #3a1f1f;
    color: #f5cccc;
  }

  .state.subtle {
    padding: 6px 0;
    background: transparent;
    color: #9a9a9a;
  }

  .window-section {
    border: 1px solid #3e3e42;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    background: #252526;
  }

  .window-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .window-title {
    font-weight: 600;
    font-size: 14px;
  }

  .window-active {
    font-size: 12px;
    color: #a0a0a0;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px;
    background: #2d2d30;
    border-radius: 6px;
    border: 1px solid #3a3a3e;
  }

  .icon {
    font-size: 16px;
  }

  .tab-info {
    min-width: 0;
  }

  .tab-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-meta {
    font-size: 12px;
    color: #a0a0a0;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #c0c0c0;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: #3a3a3e;
  }
</style>
