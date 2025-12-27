<script lang="ts">
  import { getContext } from 'svelte';
  import type { ChatMessage, MessageContent } from '../../../types';
  import type { RenderMode } from '../../rendering';
  import { renderMessage } from '../../rendering';
  import { copyToClipboard } from '../../utils/markdown';
  import { defaultRenderMode } from '$stores/config';
  import { toastStore } from '$stores/toast';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  // Get IPC bridge from context
  const ipc = getContext<IPCBridgeAPI>('ipc');

  let { message }: { message: ChatMessage } = $props();

  // Helper to get text content from MessageContent
  function getTextContent(content: MessageContent): string {
    if (typeof content === 'string') {
      return content;
    }
    // For ContentBlock[], extract text from text blocks
    return content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n');
  }

  const textContent = $derived(getTextContent(message.content));
  const isUser = $derived(message.role === 'user');
  const isAssistant = $derived(message.role === 'assistant');
  const isError = $derived(textContent.startsWith('Error:'));

  // Render mode state - defaults to global preference
  let renderMode = $state<RenderMode>($defaultRenderMode);
  let copyFeedback = $state(false);

  const renderedContent = $derived(
    isAssistant ? renderMessage(textContent, { mode: renderMode }).html : null
  );

  async function handleCopy() {
    const success = await copyToClipboard(textContent);
    if (success) {
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    }
  }

  function toggleRenderMode() {
    renderMode = renderMode === 'markdown' ? 'raw' : 'markdown';
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
      const normalizedCode = code.replace(/\r\n/g, '\n').trimEnd();
      const lineCount = normalizedCode === '' ? 0 : normalizedCode.split('\n').length;
      const tabSlug = 'chat';
      const title = `Code (${lang}) – ${tabSlug} – ${lineCount} line${lineCount === 1 ? '' : 's'}`;
      // Open in background (autoSelect = false)
      await ipc.openNoteTab(noteId, title, code, 'text', undefined, false);
      toastStore.show('Code opened in new note', 'success', 2000);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="chat-message" class:user={isUser} class:assistant={isAssistant} class:error={isError} onclick={handleCodeBlockAction}>
  <div class="message-header">
    <span class="role">{isUser ? 'You' : 'Assistant'}</span>
    <div class="message-controls">
      {#if isAssistant}
        <div class="render-mode-toggle" role="group" aria-label="Render mode toggle">
          <button
            class="toggle-btn"
            class:active={renderMode === 'markdown'}
            onclick={renderMode === 'markdown' ? undefined : toggleRenderMode}
            title="Markdown view"
            aria-pressed={renderMode === 'markdown'}
            disabled={renderMode === 'markdown'}
          >MD</button>
          <button
            class="toggle-btn"
            class:active={renderMode === 'raw'}
            onclick={renderMode === 'raw' ? undefined : toggleRenderMode}
            title="Raw text view"
            aria-pressed={renderMode === 'raw'}
            disabled={renderMode === 'raw'}
          >Raw</button>
        </div>
      {/if}
      <button
        class="control-btn"
        onclick={handleCopy}
        title="Copy to clipboard"
      >
        {copyFeedback ? '✓' : '📋'}
      </button>
    </div>
  </div>
  <div class="message-content" class:raw-mode={renderMode === 'raw'}>
    {#if isAssistant && renderedContent}
      {@html renderedContent}
    {:else}
      {textContent}
    {/if}
  </div>
</div>

<style>
  .chat-message {
    margin-bottom: var(--space-9);
    padding: var(--space-7);
    border-radius: var(--radius-lg);
    background-color: var(--bg-tertiary);
  }

  .chat-message.user {
    background-color: var(--bg-active);
    margin-left: 20%;
  }

  .chat-message.assistant {
    background-color: var(--bg-tertiary);
    margin-right: 20%;
  }

  .chat-message.error {
    background-color: var(--warning-bg);
    border: 2px solid var(--warning-border);
    margin-right: 10%;
    position: relative;
    z-index: 100;
  }

  .chat-message.error .role {
    color: var(--error-text);
  }

  .chat-message.error .message-content {
    color: var(--error-text);
  }

  .message-header {
    margin-bottom: var(--space-4);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .role {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--accent-color);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chat-message.user .role {
    color: var(--link-color);
  }

  .message-controls {
    display: flex;
    gap: var(--space-4);
    align-items: center;
  }

  .render-mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0;
    background-color: var(--bg-primary);
    border-radius: var(--radius-md);
    padding: 2px;
    font-size: var(--text-xs);
  }

  .toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
    border-radius: var(--radius-default);
    transition: all var(--transition-fast);
    min-width: 36px;
    text-align: center;
  }

  .toggle-btn:hover:not(:disabled) {
    color: var(--text-primary);
    background-color: var(--bg-hover-subtle);
  }

  .toggle-btn:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 1px;
  }

  .toggle-btn.active {
    background-color: var(--accent-color);
    color: var(--bg-primary);
    cursor: default;
  }

  .toggle-btn:disabled {
    cursor: default;
  }

  .control-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-base);
    opacity: 0.7;
    transition: opacity var(--transition-fast);
    border-radius: var(--radius-md);
  }

  .control-btn:hover {
    opacity: 1;
    background-color: var(--bg-hover-subtle);
  }

  .message-content {
    font-size: var(--text-base);
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* Markdown rendering styles */
  .message-content :global(h1),
  .message-content :global(h2),
  .message-content :global(h3),
  .message-content :global(h4),
  .message-content :global(h5),
  .message-content :global(h6) {
    margin-top: var(--space-8);
    margin-bottom: var(--space-4);
    font-weight: var(--font-semibold);
    color: var(--text-bright);
  }

  .message-content :global(h1) { font-size: 1.8em; }
  .message-content :global(h2) { font-size: 1.5em; }
  .message-content :global(h3) { font-size: 1.3em; }

  .message-content :global(p) {
    margin: var(--space-4) 0;
  }

  .message-content :global(ul),
  .message-content :global(ol) {
    margin: var(--space-4) 0;
    padding-left: var(--space-10);
  }

  .message-content :global(li) {
    margin: var(--space-2) 0;
  }

  .message-content :global(code.inline-code) {
    background-color: var(--bg-hover-subtle);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-default);
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  /* Code block wrapper - header-based design */
  .message-content :global(.code-block-wrapper) {
    margin: var(--space-6) 0;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    overflow: hidden;
    background-color: var(--bg-primary);
  }

  .message-content :global(.code-block-header) {
    /* Layout handled by inline styles, this is for hover effects */
    background-color: transparent;
  }

  .message-content :global(.code-block-actions) {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 4px !important;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .message-content :global(.code-block-wrapper:hover .code-block-actions) {
    opacity: 1;
  }

  .message-content :global(.code-lang-label) {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--text-secondary);
    text-transform: lowercase;
  }

  .message-content :global(.code-action-btn) {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--text-secondary);
    border-radius: var(--radius-default);
    transition: all 0.15s ease;
  }

  .message-content :global(.code-action-btn:hover) {
    color: var(--text-primary);
    background-color: var(--bg-hover);
  }

  .message-content :global(.code-action-btn svg) {
    display: block;
  }

  .message-content :global(pre) {
    background-color: var(--bg-primary);
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    overflow-x: auto;
    margin: var(--space-6) 0;
    border: 1px solid var(--border-color);
  }

  /* Override pre styles when inside code-block-wrapper */
  .message-content :global(.code-block-wrapper pre) {
    margin: 0;
    border: none;
    border-radius: 0;
  }

  .message-content :global(pre code) {
    font-family: var(--font-mono);
    font-size: var(--text-md);
    line-height: var(--leading-relaxed);
  }

  .message-content :global(blockquote) {
    border-left: 4px solid var(--accent-color);
    padding-left: var(--space-6);
    margin: var(--space-6) 0;
    color: var(--text-secondary);
    font-style: italic;
  }

  .message-content :global(a) {
    color: var(--link-color);
    text-decoration: none;
  }

  .message-content :global(a:hover) {
    text-decoration: underline;
  }

  .message-content :global(table) {
    border-collapse: collapse;
    margin: var(--space-6) 0;
    width: 100%;
  }

  .message-content :global(th),
  .message-content :global(td) {
    border: 1px solid var(--border-color);
    padding: var(--space-4);
    text-align: left;
  }

  .message-content :global(th) {
    background-color: var(--bg-tertiary);
    font-weight: var(--font-semibold);
  }

  /* Math error styling */
  .message-content :global(.math-error) {
    color: var(--error-text);
    font-family: var(--font-mono);
  }

  /* Raw text display styles */
  .message-content.raw-mode {
    font-family: var(--font-mono);
    background-color: var(--bg-primary);
    padding: var(--space-4);
    border-radius: var(--radius-md);
  }

  .message-content :global(.raw-text-content) {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: var(--font-mono);
    font-size: var(--text-md);
    line-height: var(--leading-relaxed);
  }
</style>
