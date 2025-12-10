<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { activeTabs } from '$stores/tabs';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  let { tabId }: { tabId: string } = $props();

  const ipc = getContext<IPCBridgeAPI>('ipc');

  // Get tab from store
  const tab = $derived($activeTabs.get(tabId));

  // Local state for editing
  let content = $state('');
  let isInitialized = $state(false);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let textareaElement: HTMLTextAreaElement | null = $state(null);

  // Initialize content from tab metadata
  $effect(() => {
    if (tab && !isInitialized) {
      content = tab.metadata?.noteContent || '';
      isInitialized = true;
    }
  });

  // Auto-save with debounce when content changes
  function handleContentChange(): void {
    if (!ipc || !tabId) return;

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Debounce save to avoid too many IPC calls
    saveTimeout = setTimeout(async () => {
      try {
        await ipc.updateNoteContent(tabId, content);
      } catch (error) {
        console.error('Failed to save note content:', error);
      }
    }, 300);
  }

  // Focus textarea on mount
  onMount(() => {
    if (textareaElement) {
      textareaElement.focus();
    }

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  });
</script>

<div class="note-editor">
  <div class="note-header">
    <h1 class="note-title">{tab?.title || 'Untitled Note'}</h1>
    <p class="note-hint">Edit your note below. Changes are saved automatically.</p>
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

  .note-title {
    font-size: 24px;
    font-weight: 600;
    color: #ffffff;
    margin: 0 0 10px 0;
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
</style>
