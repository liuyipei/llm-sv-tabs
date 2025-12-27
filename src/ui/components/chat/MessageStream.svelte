<script lang="ts">
  import { onMount, onDestroy, getContext } from 'svelte';
  import { activeTabs } from '$stores/tabs';
  import { defaultRenderMode } from '$stores/config';
  import { toastStore } from '$stores/toast';
  import type { ContextTabInfo, Tab } from '../../../types';
  import type { RenderMode } from '../../rendering';
  import { renderMessage, escapeHtml } from '../../rendering';
  import { copyToClipboard } from '../../utils/markdown';
  import { searchState, updateSearchResults } from '$stores/search';
  import { createDOMSearch, type DOMSearchInstance } from '$lib/dom-search';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import '../../styles/message-stream.css';
  import QueryHeader from './message-stream/QueryHeader.svelte';
  import IdentifiersSection from './message-stream/IdentifiersSection.svelte';
  import ContextTabsSection from './message-stream/ContextTabsSection.svelte';
  import ResponseMetadata from './message-stream/ResponseMetadata.svelte';
  import RenderModeToggle from './message-stream/RenderModeToggle.svelte';

  // Get IPC bridge from context
  const ipc = getContext<IPCBridgeAPI>('ipc');

  declare global {
    interface Window {
      electronAPI?: {
        onLLMChunk: (
          cb: (payload: { tabId: string; chunk: string }) => void
        ) => () => void;
      };
    }
  }

  // Svelte 5 props
  let { tabId }: { tabId: string } = $props();

  let container: HTMLDivElement | null = null;

  const mountId = Math.random().toString(36).slice(2, 8);

  // Svelte 5 runes state
  let fullText = $state('');
  let stableHtml = $state('');
  let unstableHtml = $state('');

  // Render mode state - defaults to global preference
  let renderMode = $state<RenderMode>($defaultRenderMode);

  function toggleRenderMode() {
    renderMode = renderMode === 'markdown' ? 'raw' : 'markdown';
    // Re-render with new mode
    updateBuffers();
  }

  let unsubscribe: (() => void) | null = null;
  let tabsUnsubscribe: (() => void) | null = null;
  let renderScheduled = false;
  let hasLoadedInitialData = $state(false);
  let lastAppliedMetadataResponse = $state('');
  let renderCount = 0;

  // DOM search instance
  let domSearch: DOMSearchInstance | null = null;
  let lastCommandSeq = 0;

  // Get tab metadata
  const tab = $derived($activeTabs.get(tabId));
  const metadata = $derived(tab?.metadata);
  const query = $derived(metadata?.query || metadata?.fullQuery || '');
  const tokensIn = $derived(metadata?.tokensIn);
  const tokensOut = $derived(metadata?.tokensOut);
  const model = $derived(metadata?.model);
  const isStreaming = $derived(metadata?.isStreaming);
  const error = $derived(metadata?.error);
  const created = $derived(tab?.created);

  // Get context tabs used in the query
  const slug = $derived(metadata?.slug);
  const shortId = $derived(metadata?.shortId);
  const persistentId = $derived(metadata?.persistentId);

  const contextTabs = $derived.by((): Array<ContextTabInfo & { favicon?: string }> => {
    if (metadata?.contextTabs && metadata.contextTabs.length > 0) {
      return metadata.contextTabs;
    }

    if (!metadata?.selectedTabIds || metadata.selectedTabIds.length === 0) {
      return [];
    }

    return metadata.selectedTabIds
      .map(id => $activeTabs.get(id))
      .filter((t): t is Tab => t !== undefined)
      .map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        type: tab.type,
        favicon: tab.favicon,
        slug: tab.metadata?.slug,
        shortId: tab.metadata?.shortId,
        persistentId: tab.metadata?.persistentId
      }));
  });

  const showFullQuery = $derived(Boolean(metadata?.fullQuery && metadata.fullQuery !== metadata.query));

  // Effect to load existing data when metadata becomes available
  $effect(() => {
    renderCount += 1;
    console.log(`⚡ [MessageStream-${mountId}] render #${renderCount}`, {
      tabId,
      streaming: metadata?.isStreaming,
      hasResponse: Boolean(fullText.length || metadata?.response?.length),
    });

    const metadataResponse = metadata?.response || '';
    if (metadataResponse && metadataResponse !== lastAppliedMetadataResponse) {
      fullText = metadataResponse;
      lastAppliedMetadataResponse = metadataResponse;
      updateBuffers();
      hasLoadedInitialData = true;
    }
  });

  // Effect to handle search commands
  $effect(() => {
    const state = $searchState;

    // Only process if there's a new command
    if (state.commandSeq === lastCommandSeq || !state.command) {
      return;
    }
    lastCommandSeq = state.commandSeq;

    // Initialize DOM search if needed
    if (!domSearch && container) {
      domSearch = createDOMSearch(container);
    }

    if (!domSearch) return;

    let result;
    switch (state.command) {
      case 'search':
        result = domSearch.search(state.searchText);
        updateSearchResults(result.activeMatchIndex, result.totalMatches);
        break;
      case 'next':
        result = domSearch.findNext();
        updateSearchResults(result.activeMatchIndex, result.totalMatches);
        break;
      case 'previous':
        result = domSearch.findPrevious();
        updateSearchResults(result.activeMatchIndex, result.totalMatches);
        break;
      case 'clear':
        domSearch.clear();
        updateSearchResults(0, 0);
        break;
    }
  });

  function updateBuffers() {
    if (renderMode === 'raw') {
      // Raw mode: render as escaped text, no splitting needed
      stableHtml = '';
      unstableHtml = renderMessage(fullText, {
        mode: 'raw',
        metadata: { isStreaming: metadata?.isStreaming }
      }).html;
    } else {
      // Markdown mode: split by last blank line as boundary for stable/unstable
      const splitIdx = fullText.lastIndexOf('\n\n');
      const stableMd = splitIdx === -1 ? '' : fullText.slice(0, splitIdx);
      const unstableMd = splitIdx === -1 ? fullText : fullText.slice(splitIdx);

      stableHtml = renderMessage(stableMd, {
        mode: 'markdown',
        metadata: { isStreaming: metadata?.isStreaming }
      }).html;
      unstableHtml = renderMessage(unstableMd, {
        mode: 'markdown',
        metadata: { isStreaming: metadata?.isStreaming }
      }).html;
    }

    // Auto-scroll if user is near bottom
    if (container) {
      const nearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 32;
      if (nearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      updateBuffers();
    });
  }

  function formatTimestamp(timestamp: number | undefined): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Handle code block action button clicks (copy, open-as-note)
   */
  async function handleCodeBlockAction(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const button = target.closest('.code-action-btn') as HTMLElement | null;
    if (!button) return;

    const action = button.dataset.action;
    const encodedCode = button.dataset.code;
    if (!encodedCode) return;

    // Decode the base64 encoded code
    const code = decodeURIComponent(escape(atob(encodedCode)));

    if (action === 'copy') {
      const success = await copyToClipboard(code);
      if (success) {
        // Show copied feedback on button
        const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
        const copiedIcon = button.querySelector('.copied-icon') as HTMLElement;
        if (copyIcon && copiedIcon) {
          copyIcon.style.display = 'none';
          copiedIcon.style.display = 'inline';
          setTimeout(() => {
            copyIcon.style.display = 'inline';
            copiedIcon.style.display = 'none';
          }, 2000);
        }
        // Show toast
        toastStore.show('Code copied to clipboard', 'success', 2000);
      }
    } else if (action === 'open-note' && ipc) {
      const lang = button.dataset.lang || 'text';
      const noteId = Date.now();
      const title = `Code (${lang})`;
      // Open in background (autoSelect = false)
      await ipc.openNoteTab(noteId, title, code, 'text', undefined, false);
      toastStore.show('Code opened in new note', 'success', 2000);
    }
  }

  onMount(() => {
    console.log(`🟡 [MessageStream-${mountId}] mounting`, {
      tabId,
      initialStreaming: metadata?.isStreaming,
    });

    tabsUnsubscribe = activeTabs.subscribe((tabsMap) => {
      const currentTab = tabsMap.get(tabId);
      if (currentTab) {
        console.log(`🟣 [MessageStream-${mountId}] store update`, {
          tabId,
          streaming: currentTab.metadata?.isStreaming,
          hasResponse: Boolean(currentTab.metadata?.response?.length),
          knownTabs: tabsMap.size,
        });
      } else {
        console.warn(`🟣 [MessageStream-${mountId}] store update missing tab`, {
          tabId,
          knownTabs: tabsMap.size,
        });
      }
    });

    if (!window.electronAPI?.onLLMChunk) return;

    unsubscribe = window.electronAPI.onLLMChunk(({ tabId: incomingId, chunk }) => {
      if (incomingId !== tabId) return;

      // Skip duplicate chunks when the response has already been merged into metadata
      if (chunk && fullText.endsWith(chunk)) {
        console.log(`🟢 [MessageStream-${mountId}] skipped duplicate chunk`, {
          tabId,
          chunkPreview: chunk.slice(0, 32),
        });
        return;
      }

      fullText += chunk;
      scheduleRender();
    });
  });

  onDestroy(() => {
    console.log(`🟡 [MessageStream-${mountId}] unmounting`, { tabId });
    if (unsubscribe) unsubscribe();
    if (tabsUnsubscribe) tabsUnsubscribe();
    if (domSearch) {
      domSearch.destroy();
      domSearch = null;
    }
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="llm-message-stream" bind:this={container} onclick={handleCodeBlockAction}>
  {#if query}
    <QueryHeader {query} {created} {formatTimestamp} />
  {/if}

  <IdentifiersSection {slug} {shortId} {persistentId} />

  <ContextTabsSection {contextTabs} />

  {#if showFullQuery}
    <div class="fullquery-section">
      <div class="fullquery-label">Full Query (with context)</div>
      <div class="fullquery-content">{metadata?.fullQuery}</div>
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      <strong>Error:</strong> {error}
    </div>
  {:else}
    <div class="response-card">
      <div class="response-header">
        <div class="response-label-row">
          <div class="response-label">Response</div>
          <RenderModeToggle mode={renderMode} onToggle={toggleRenderMode} />
        </div>
        <ResponseMetadata {model} tokensIn={tokensIn} tokensOut={tokensOut} {isStreaming} />
      </div>

      <div class="response-content" class:raw-mode={renderMode === 'raw'}>
        <div class="stable">{@html stableHtml}</div>
        <div class="unstable">{@html unstableHtml}</div>
      </div>
    </div>
  {/if}
</div>

