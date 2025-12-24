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
                {/if}
                <!-- Tabs not in tabsById (e.g., aggregate-tabs itself) are silently skipped -->
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
    padding: var(--space-8);
    color: var(--text-primary);
    overflow: auto;
    height: 100%;
  }

  .state {
    padding: var(--space-5);
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
  }

  .state.error {
    background: var(--error-bg);
    color: var(--error-text);
  }

  .state.subtle {
    padding: var(--space-3) 0;
    background: transparent;
    color: var(--text-tertiary);
  }

  .window-section {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
    background: var(--bg-secondary);
  }

  .window-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .window-title {
    font-weight: var(--font-semibold);
    font-size: var(--text-base);
  }

  .window-active {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-5);
    align-items: center;
    padding: var(--space-4);
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
  }

  .icon {
    font-size: var(--text-lg);
  }

  .tab-info {
    min-width: 0;
  }

  .tab-title {
    font-weight: var(--font-semibold);
    font-size: var(--text-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-meta {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-lg);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--bg-hover);
  }
</style>
