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
    background-color: #1e1e1e;
    color: #d4d4d4;
  }

  .note-header {
    padding: 40px 40px 20px 40px;
    border-bottom: 2px solid #007acc;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .note-title-input {
    width: 100%;
    font-size: 24px;
    font-weight: 600;
    color: #ffffff;
    background-color: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 0 0 8px 0;
    margin: 0 0 10px 0;
    outline: none;
    transition: border-color 0.2s;
  }

  .note-title-input:hover {
    border-bottom-color: #3e3e42;
  }

  .note-title-input:focus {
    border-bottom-color: #007acc;
  }

  .note-title-input::placeholder {
    color: #606060;
  }

  .note-hint {
    font-size: 13px;
    color: #808080;
    margin: 0;
  }

  .note-content {
    flex: 1;
    padding: 20px 40px 40px 40px;
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
    background-color: #2d2d30;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 20px;
    font-family: 'Courier New', Consolas, monospace;
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
  }

  .note-textarea:focus {
    border-color: #007acc;
  }

  .note-textarea::placeholder {
    color: #606060;
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
    margin-bottom: 20px;
  }

  .error-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 10px;
    color: #f48771;
  }

  .error-message {
    font-size: 14px;
    color: #999;
    margin-bottom: 15px;
    max-width: 400px;
  }

  .file-path {
    font-size: 12px;
    color: #666;
    word-break: break-all;
    background: #2d2d2d;
    padding: 8px 12px;
    border-radius: 4px;
    max-width: 500px;
  }
</style>
