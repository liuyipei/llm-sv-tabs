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

    const url = $urlInput.trim();

    // Add http:// if no protocol specified
    const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

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
    console.log('focusUrlInputElement called, element exists:', !!urlInputElement);
    if (urlInputElement) {
      // Defer to let webContents focus change settle first
      setTimeout(() => {
        console.log('Calling focus() and select() on URL input');
        urlInputElement.focus();
        urlInputElement.select();
        console.log('focus() and select() completed');
      }, 0);
    } else {
      console.warn('urlInputElement is not defined!');
    }
  }

  // Register focus callback on mount
  onMount(() => {
    console.log('UrlBar onMount, registering focus callback');
    if (setFocusUrlInputCallback) {
      setFocusUrlInputCallback(focusUrlInputElement);
      console.log('UrlBar focus callback registered');
    } else {
      console.warn('setFocusUrlInputCallback not available in context');
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
