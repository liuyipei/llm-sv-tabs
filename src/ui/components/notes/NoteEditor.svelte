<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { activeTabs } from '$stores/tabs';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  let { tabId }: { tabId: string } = $props();

  const ipc = getContext<IPCBridgeAPI>('ipc');

  // Get tab from store
  const tab = $derived($activeTabs.get(tabId));

  // Check for file load error
  const fileLoadError = $derived(tab?.metadata?.fileLoadError);
  const filePath = $derived(tab?.metadata?.filePath);

  // Local state for editing
  let title = $state('');
  let content = $state('');
  let isInitialized = $state(false);
  let contentSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let titleSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let textareaElement: HTMLTextAreaElement | null = $state(null);

  // Initialize content and title from tab metadata
  $effect(() => {
    if (tab && !isInitialized) {
      title = tab.title || '';
      content = tab.metadata?.noteContent || '';
      isInitialized = true;
    }
  });

  // Auto-save content with debounce
  function handleContentChange(): void {
    if (!ipc || !tabId) return;

    if (contentSaveTimeout) {
      clearTimeout(contentSaveTimeout);
    }

    contentSaveTimeout = setTimeout(async () => {
      try {
        await ipc.updateNoteContent(tabId, content);
      } catch (error) {
        console.error('Failed to save note content:', error);
      }
    }, 300);
  }

  // Auto-save title with debounce
  function handleTitleChange(): void {
    if (!ipc || !tabId) return;

    if (titleSaveTimeout) {
      clearTimeout(titleSaveTimeout);
    }

    titleSaveTimeout = setTimeout(async () => {
      try {
        await ipc.updateTabTitle(tabId, title);
      } catch (error) {
        console.error('Failed to save note title:', error);
      }
    }, 300);
  }

  // Focus textarea on mount
  onMount(() => {
    if (textareaElement) {
      textareaElement.focus();
    }

    // Cleanup timeouts on unmount
    return () => {
      if (contentSaveTimeout) {
        clearTimeout(contentSaveTimeout);
      }
      if (titleSaveTimeout) {
        clearTimeout(titleSaveTimeout);
      }
    };
  });
</script>

<div class="note-editor">
  {#if fileLoadError}
    <div class="error-container">
      <div class="error-icon">&#128463;</div>
      <div class="error-title">File Not Available</div>
      <div class="error-message">{fileLoadError}</div>
      {#if filePath}
        <div class="file-path">{filePath}</div>
      {/if}
    </div>
  {:else}
    <div class="note-header">
      <input
        type="text"
        bind:value={title}
        oninput={handleTitleChange}
        class="note-title-input"
        placeholder="Note title..."
      />
      <p class="note-hint">Changes are saved automatically.</p>
    </div>
    <div class="note-content">
      <textarea
        bind:this={textareaElement}
        bind:value={content}
        oninput={handleContentChange}
        class="note-textarea"
        placeholder="Start typing your note..."
      ></textarea>
    </div>
  {/if}
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  .note-header {
    padding: 40px 40px var(--space-9) 40px;
    border-bottom: 2px solid var(--accent-color);
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .note-title-input {
    width: 100%;
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: var(--text-bright);
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 0 var(--space-4) 0;
    margin: 0 0 var(--space-5) 0;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .note-title-input:hover {
    border-bottom-color: var(--border-color);
  }

  .note-title-input:focus {
    border-bottom-color: var(--accent-color);
  }

  .note-title-input::placeholder {
    color: var(--text-disabled);
  }

  .note-hint {
    font-size: var(--text-md);
    color: var(--text-tertiary);
    margin: 0;
  }

  .note-content {
    flex: 1;
    padding: var(--space-9) 40px 40px 40px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .note-textarea {
    flex: 1;
    width: 100%;
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-9);
    font-family: var(--font-mono);
    font-size: var(--text-base);
    line-height: 1.6;
    resize: none;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .note-textarea:focus {
    border-color: var(--accent-color);
  }

  .note-textarea::placeholder {
    color: var(--text-disabled);
  }

  /* Error state styles */
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 40px;
  }

  .error-icon {
    font-size: 48px;
    margin-bottom: var(--space-9);
  }

  .error-title {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin-bottom: var(--space-5);
    color: var(--error-text);
  }

  .error-message {
    font-size: var(--text-base);
    color: var(--text-secondary);
    margin-bottom: var(--space-7);
    max-width: 400px;
  }

  .file-path {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    word-break: break-all;
    background: var(--bg-tertiary);
    padding: var(--space-4) var(--space-6);
    border-radius: var(--radius-md);
    max-width: 500px;
  }
</style>
