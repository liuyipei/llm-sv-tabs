<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { urlInput } from '$stores/ui';
  import { activeTabId } from '$stores/tabs';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  const ipc = getContext<IPCBridgeAPI>('ipc');
  const setFocusUrlInputCallback = getContext<(callback: () => void) => void>('setFocusUrlInputCallback');

  // Reference to the URL input element
  let urlInputElement: HTMLInputElement;

  // Navigation state
  let canGoBack = false;
  let canGoForward = false;

  // Update navigation state when active tab changes
  $: if ($activeTabId && ipc) {
    updateNavigationState($activeTabId);
  }

  async function updateNavigationState(tabId: string): Promise<void> {
    if (!ipc) return;
    try {
      const result = await ipc.getNavigationState(tabId);
      // Handle both IPCResponse<{ canGoBack, canGoForward }> and { success, canGoBack, canGoForward }
      if ('data' in result && result.data) {
        canGoBack = result.data.canGoBack || false;
        canGoForward = result.data.canGoForward || false;
      } else if ('canGoBack' in result) {
        canGoBack = result.canGoBack || false;
        canGoForward = result.canGoForward || false;
      }
    } catch (error) {
      console.error('Failed to get navigation state:', error);
    }
  }

  async function handleGoBack(): Promise<void> {
    if (!ipc || !$activeTabId || !canGoBack) return;
    try {
      await ipc.goBack($activeTabId);
      // Update navigation state after navigation
      setTimeout(() => updateNavigationState($activeTabId), 100);
    } catch (error) {
      console.error('Failed to go back:', error);
    }
  }

  async function handleGoForward(): Promise<void> {
    if (!ipc || !$activeTabId || !canGoForward) return;
    try {
      await ipc.goForward($activeTabId);
      // Update navigation state after navigation
      setTimeout(() => updateNavigationState($activeTabId), 100);
    } catch (error) {
      console.error('Failed to go forward:', error);
    }
  }

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

  // Register focus callback and navigation state listener on mount
  onMount(() => {
    if (setFocusUrlInputCallback) {
      setFocusUrlInputCallback(focusUrlInputElement);
    }

    // Listen for URL changes to update navigation state
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onTabUrlUpdated(() => {
        // When URL changes, update navigation state for the active tab
        if ($activeTabId && ipc) {
          updateNavigationState($activeTabId);
        }
      });
    }

    if (ipc && ipc.onNavigationStateUpdated) {
      ipc.onNavigationStateUpdated((state) => {
        if (state.id === $activeTabId) {
          canGoBack = state.canGoBack;
          canGoForward = state.canGoForward;
        }
      });
    }
  });
</script>

<div class="url-bar">
  <button
    onclick={handleGoBack}
    class="nav-btn"
    disabled={!canGoBack}
    title="Go back (Alt+Left)"
  >
    ←
  </button>
  <button
    onclick={handleGoForward}
    class="nav-btn"
    disabled={!canGoForward}
    title="Go forward (Alt+Right)"
  >
    →
  </button>
  <input
    type="text"
    bind:this={urlInputElement}
    bind:value={$urlInput}
    onkeydown={handleUrlKeydown}
    placeholder="Enter URL to open a new tab..."
    class="url-input"
    title="Address bar (Ctrl+L to focus, Ctrl+T for new tab)"
  />
  <button onclick={handleUrlSubmit} class="url-submit-btn" disabled={!$urlInput.trim()} title="Open URL (Enter)">
    Open
  </button>
</div>

<style>
  .url-bar {
    display: flex;
    gap: var(--space-5);
    padding: var(--space-4) var(--space-7);
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .nav-btn {
    background-color: var(--bg-input);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-6);
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    cursor: pointer;
    transition: all var(--transition-fast);
    height: 2.25rem;
    min-width: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover:not(:disabled) {
    background-color: #4e4e52;
    border-color: var(--accent-color);
  }

  .nav-btn:disabled {
    background-color: var(--bg-tertiary);
    color: var(--text-disabled);
    cursor: not-allowed;
    border-color: var(--border-color);
  }

  .url-input {
    flex: 1;
    background-color: var(--bg-input);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-6);
    font-family: inherit;
    font-size: var(--text-base);
    height: 2.25rem;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .url-submit-btn {
    background-color: var(--accent-color);
    color: var(--text-bright);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-9);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    white-space: nowrap;
  }

  .url-submit-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .url-submit-btn:disabled {
    background-color: var(--bg-hover);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
</style>
