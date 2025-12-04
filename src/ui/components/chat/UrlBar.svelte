<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { urlInput } from '$stores/ui';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  const ipc = getContext<IPCBridgeAPI>('ipc');
  const setFocusUrlInputCallback = getContext<(callback: () => void) => void>('setFocusUrlInputCallback');

  // Reference to the URL input element
  let urlInputElement: HTMLInputElement;

  async function handleUrlSubmit(): Promise<void> {
    if (!$urlInput.trim()) return;

    const input = $urlInput.trim();

    // Check if this looks like a search query:
    // - Contains spaces OR
    // - Doesn't contain a dot (not a domain)
    const isSearchQuery = input.includes(' ') || !input.includes('.');

    let fullUrl: string;
    if (isSearchQuery) {
      // Convert to Google search
      fullUrl = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
    } else {
      // Treat as URL - add https:// if no protocol specified
      fullUrl = input.match(/^https?:\/\//) ? input : `https://${input}`;
    }

    if (ipc) {
      try {
        await ipc.openUrl(fullUrl);
        $urlInput = '';
      } catch (error) {
        console.error('Failed to open URL:', error);
      }
    }
  }

  function handleUrlKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleUrlSubmit();
    }
  }

  function focusUrlInputElement(): void {
    if (urlInputElement) {
      // Defer to let webContents focus change settle first
      setTimeout(() => {
        urlInputElement.focus();
        urlInputElement.select();
      }, 0);
    }
  }

  // Register focus callback on mount
  onMount(() => {
    if (setFocusUrlInputCallback) {
      setFocusUrlInputCallback(focusUrlInputElement);
    }
  });
</script>

<div class="url-bar">
  <input
    type="text"
    bind:this={urlInputElement}
    bind:value={$urlInput}
    onkeydown={handleUrlKeydown}
    placeholder="Enter URL to open a new tab..."
    class="url-input"
  />
  <button onclick={handleUrlSubmit} class="url-submit-btn" disabled={!$urlInput.trim()}>
    Open
  </button>
</div>

<style>
  .url-bar {
    display: flex;
    gap: 10px;
    padding: 8px 15px;
    background-color: #252526;
    border-bottom: 1px solid #3e3e42;
  }

  .url-input {
    flex: 1;
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 8px 12px;
    font-family: inherit;
    font-size: 14px;
    height: 36px;
  }

  .url-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .url-submit-btn {
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
  }

  .url-submit-btn:hover:not(:disabled) {
    background-color: #005a9e;
  }

  .url-submit-btn:disabled {
    background-color: #3e3e42;
    color: #808080;
    cursor: not-allowed;
  }
</style>
