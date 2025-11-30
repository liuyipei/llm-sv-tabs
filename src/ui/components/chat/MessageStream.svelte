<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { activeTabs } from '$stores/tabs';

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

  // Svelte 5 runes state
  let fullText = $state('');
  let stableHtml = $state('');
  let unstableHtml = $state('');

  let unsubscribe: (() => void) | null = null;
  let renderScheduled = false;
  let hasLoadedInitialData = $state(false);

  // Get tab metadata
  const tab = $derived($activeTabs.get(tabId));
  const metadata = $derived(tab?.metadata);
  const query = $derived(metadata?.query || metadata?.fullQuery || '');
  const tokensIn = $derived(metadata?.tokensIn);
  const tokensOut = $derived(metadata?.tokensOut);
  const model = $derived(metadata?.model);
  const isStreaming = $derived(metadata?.isStreaming);
  const error = $derived(metadata?.error);

  // Effect to load existing data when metadata becomes available
  $effect(() => {
    if (!hasLoadedInitialData && metadata?.response) {
      fullText = metadata.response;
      updateBuffers();
      hasLoadedInitialData = true;
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

  onMount(() => {
    if (!window.electronAPI?.onLLMChunk) return;

    unsubscribe = window.electronAPI.onLLMChunk(({ tabId: incomingId, chunk }) => {
      if (incomingId !== tabId) return;
      fullText += chunk;
      scheduleRender();
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>

<div class="llm-message-stream" bind:this={container}>
  {#if query}
    <div class="query-header">
      <div class="query-label">Query:</div>
      <div class="query-text">{query}</div>
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      <strong>Error:</strong> {error}
    </div>
  {:else}
    <div class="response-header">
      <div class="response-label">Response:</div>
      {#if model || tokensIn !== undefined || tokensOut !== undefined}
        <div class="metadata">
          {#if model}
            <span class="metadata-item">Model: {model}</span>
          {/if}
          {#if tokensIn !== undefined}
            <span class="metadata-item">In: {tokensIn.toLocaleString()} tokens</span>
          {/if}
          {#if tokensOut !== undefined}
            <span class="metadata-item">Out: {tokensOut.toLocaleString()} tokens</span>
          {/if}
          {#if isStreaming}
            <span class="metadata-item streaming">Streaming...</span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="response-content">
      <div class="stable">{@html stableHtml}</div>
      <div class="unstable">{@html unstableHtml}</div>
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

  .query-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #007acc;
    margin-bottom: 0.5rem;
    letter-spacing: 0.5px;
  }

  .query-text {
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .response-header {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #3e3e42;
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
    gap: 1rem;
    font-size: 0.85rem;
  }

  .metadata-item {
    color: #8c8c8c;
  }

  .metadata-item.streaming {
    color: #4ec9b0;
    font-weight: 500;
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
</style>
