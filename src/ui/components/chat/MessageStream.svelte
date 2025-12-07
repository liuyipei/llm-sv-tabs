<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { activeTabs } from '$stores/tabs';
  import type { ContextTabInfo, Tab } from '../../../types';
  import { searchState, updateSearchResults } from '$stores/search';
  import { createDOMSearch, type DOMSearchInstance } from '$lib/dom-search';

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
  const showIdentifiers = $derived(Boolean(slug || shortId || persistentId));

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
    // Simple block split: last blank line as boundary
    const splitIdx = fullText.lastIndexOf('\n\n');
    const stableMd = splitIdx === -1 ? '' : fullText.slice(0, splitIdx);
    const unstableMd = splitIdx === -1 ? fullText : fullText.slice(splitIdx);

    stableHtml = DOMPurify.sanitize(marked.parse(stableMd) as string);
    unstableHtml = DOMPurify.sanitize(marked.parse(unstableMd) as string);

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

<div class="llm-message-stream" bind:this={container}>
  {#if query}
    <div class="query-header">
      <div class="query-header-top">
        <div class="query-label">Query</div>
        {#if created}
          <div class="query-timestamp">{formatTimestamp(created)}</div>
        {/if}
      </div>
      <div class="query-text">{query}</div>
    </div>
  {/if}

  {#if showIdentifiers}
    <div class="identifiers-section">
      <div class="identifiers-label">Tab Identifiers</div>
      <div class="identifiers-list">
        {#if slug}
          <div class="identifier-row"><span class="identifier-label">Slug:</span> <span class="identifier-value">{slug}</span></div>
        {/if}
        {#if shortId}
          <div class="identifier-row"><span class="identifier-label">Short ID:</span> <span class="identifier-value">{shortId}</span></div>
        {/if}
        {#if persistentId}
          <div class="identifier-row"><span class="identifier-label">UUID:</span> <span class="identifier-value">{persistentId}</span></div>
        {/if}
      </div>
    </div>
  {/if}

  {#if contextTabs.length > 0}
    <div class="context-section">
      <div class="context-label">Context ({contextTabs.length} tab{contextTabs.length === 1 ? '' : 's'})</div>
      <div class="context-tabs">
        {#each contextTabs as contextTab}
          <div class="context-tab-item">
            <div class="context-tab-header">
              <div class="context-tab-title-container">
                {#if contextTab.favicon}
                  <img src={contextTab.favicon} alt="" class="context-tab-favicon" />
                {/if}
                <span class="context-tab-title">{contextTab.title}</span>
              </div>
              <span class="context-tab-type">{contextTab.type}</span>
            </div>
            {#if contextTab.url && contextTab.url !== 'about:blank'}
              <div class="context-tab-url">{contextTab.url}</div>
            {/if}
            {#if contextTab.slug || contextTab.shortId}
              <div class="context-tab-ids">
                {#if contextTab.slug}
                  <span class="context-id">slug: {contextTab.slug}</span>
                {/if}
                {#if contextTab.shortId}
                  <span class="context-id">id: {contextTab.shortId}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

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
        <div class="response-label">Response</div>
        <div class="metadata">
          {#if model}
            <span class="metadata-item"><span class="metadata-label">Model:</span> {model}</span>
          {/if}
          {#if tokensIn !== undefined && tokensIn !== null}
            <span class="metadata-item"><span class="metadata-label">Tokens In:</span> <strong>{tokensIn.toLocaleString()}</strong></span>
          {/if}
          {#if tokensOut !== undefined && tokensOut !== null}
            <span class="metadata-item"><span class="metadata-label">Tokens Out:</span> <strong>{tokensOut.toLocaleString()}</strong></span>
          {/if}
          {#if (tokensIn !== undefined && tokensIn !== null) && (tokensOut !== undefined && tokensOut !== null)}
            <span class="metadata-item"><span class="metadata-label">Total:</span> <strong>{(tokensIn + tokensOut).toLocaleString()}</strong></span>
          {/if}
          {#if isStreaming}
            <span class="metadata-item streaming">● Streaming...</span>
          {/if}
        </div>
      </div>

      <div class="response-content">
        <div class="stable">{@html stableHtml}</div>
        <div class="unstable">{@html unstableHtml}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .llm-message-stream {
    overflow-y: auto;
    height: 100%;
    font-family: system-ui, sans-serif;
    padding: 1rem;
    background-color: #252526;
    color: #d4d4d4;
  }

  .query-header {
    margin-bottom: 1.5rem;
    padding: 1rem;
    background-color: #1e1e1e;
    border-left: 3px solid #007acc;
    border-radius: 4px;
  }

  .query-header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .query-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #007acc;
    letter-spacing: 0.5px;
  }

  .query-timestamp {
    font-size: 0.75rem;
    color: #8c8c8c;
    font-style: italic;
  }

  .query-text {
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .context-section {
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background-color: #1e1e1e;
    border-left: 3px solid #c586c0;
    border-radius: 4px;
  }

  .context-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #c586c0;
    margin-bottom: 0.5rem;
    letter-spacing: 0.5px;
  }

  .context-tabs {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .context-tab-item {
    padding: 0.5rem;
    background-color: #252526;
    border-radius: 3px;
    border: 1px solid #3e3e42;
  }

  .context-tab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .context-tab-title-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    overflow: hidden;
  }

  .context-tab-favicon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .context-tab-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-tab-type {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    background-color: #3e3e42;
    color: #9cdcfe;
    border-radius: 3px;
    letter-spacing: 0.5px;
  }

  .context-tab-url {
    font-size: 0.75rem;
    color: #8c8c8c;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }

  .context-tab-ids {
    margin-top: 0.25rem;
    font-size: 0.7rem;
    color: #4ec9b0;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }

  .context-id {
    margin-right: 1rem;
  }

  .response-card {
    margin-bottom: 1rem;
    background-color: #1e1e1e;
    border-left: 3px solid #4ec9b0;
    border-radius: 4px;
    overflow: hidden;
  }

  .response-header {
    padding: 0.75rem;
    background-color: #1e1e1e;
  }

  .response-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #4ec9b0;
    margin-bottom: 0.5rem;
    letter-spacing: 0.5px;
  }

  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .metadata-item {
    color: #d4d4d4;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .metadata-label {
    color: #9cdcfe;
    font-weight: 500;
  }

  .metadata-item strong {
    color: #dcdcaa;
    font-weight: 600;
  }

  .metadata-item.streaming {
    color: #4ec9b0;
    font-weight: 500;
  }

  .response-content {
    padding: 0 0.75rem 0.75rem;
  }

  .error-message {
    padding: 1rem;
    background-color: #5a1d1d;
    border-left: 3px solid #f48771;
    border-radius: 4px;
    color: #f48771;
  }

  .response-content {
    white-space: pre-wrap;
  }

  .unstable {
    opacity: 0.96;
  }

  .identifiers-section {
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background-color: #1e1e1e;
    border-left: 3px solid #569cd6;
    border-radius: 4px;
  }

  .identifiers-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #569cd6;
    margin-bottom: 0.5rem;
    letter-spacing: 0.5px;
  }

  .identifiers-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .identifier-row {
    display: flex;
    gap: 0.35rem;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.85rem;
  }

  .identifier-label {
    color: #9cdcfe;
    min-width: 70px;
  }

  .identifier-value {
    color: #dcdcaa;
  }

  .fullquery-section {
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background-color: #1e1e1e;
    border-left: 3px solid #4ec9b0;
    border-radius: 4px;
  }

  .fullquery-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #4ec9b0;
    margin-bottom: 0.5rem;
    letter-spacing: 0.5px;
  }

  .fullquery-content {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* Inherit markdown styles from existing theme */
  :global(.llm-message-stream h1),
  :global(.llm-message-stream h2),
  :global(.llm-message-stream h3),
  :global(.llm-message-stream h4),
  :global(.llm-message-stream h5),
  :global(.llm-message-stream h6) {
    color: #ffffff;
    margin-top: 24px;
    margin-bottom: 16px;
    font-weight: 600;
    line-height: 1.25;
  }

  :global(.llm-message-stream h1) {
    font-size: 2em;
    border-bottom: 1px solid #3e3e42;
    padding-bottom: 0.3em;
  }

  :global(.llm-message-stream h2) {
    font-size: 1.5em;
    border-bottom: 1px solid #3e3e42;
    padding-bottom: 0.3em;
  }

  :global(.llm-message-stream p) {
    margin-top: 0;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream pre) {
    background-color: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream code) {
    background-color: #3c3c3c;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 85%;
  }

  :global(.llm-message-stream pre code) {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 100%;
  }

  :global(.llm-message-stream blockquote) {
    border-left: 4px solid #3e3e42;
    padding-left: 16px;
    color: #8c8c8c;
    margin: 0 0 16px 0;
  }

  :global(.llm-message-stream ul),
  :global(.llm-message-stream ol) {
    padding-left: 2em;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream li) {
    margin-bottom: 4px;
  }

  :global(.llm-message-stream a) {
    color: #3794ff;
    text-decoration: none;
  }

  :global(.llm-message-stream a:hover) {
    text-decoration: underline;
  }

  :global(.llm-message-stream table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream th),
  :global(.llm-message-stream td) {
    border: 1px solid #3e3e42;
    padding: 8px 12px;
    text-align: left;
  }

  :global(.llm-message-stream th) {
    background-color: #2d2d30;
    font-weight: 600;
  }

  :global(.llm-message-stream img) {
    max-width: 100%;
    height: auto;
  }

  /* Search highlight styles */
  :global(.llm-message-stream .dom-search-highlight) {
    background-color: #5a4d00;
    color: #fff;
    border-radius: 2px;
    padding: 0 1px;
  }

  :global(.llm-message-stream .dom-search-highlight-active) {
    background-color: #ff9632;
    color: #000;
    outline: 2px solid #ff9632;
    outline-offset: 1px;
  }
</style>
