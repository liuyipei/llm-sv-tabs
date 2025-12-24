<script lang="ts">
  import type { ChatMessage, MessageContent } from '../../../types';
  import { renderMarkdown, copyToClipboard } from '../../utils/markdown';

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

  let showRaw = $state(false);
  let copyFeedback = $state(false);

  const renderedContent = $derived(
    isAssistant && !showRaw ? renderMarkdown(textContent) : null
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

  function toggleRaw() {
    showRaw = !showRaw;
  }
</script>

<div class="chat-message" class:user={isUser} class:assistant={isAssistant} class:error={isError}>
  <div class="message-header">
    <span class="role">{isUser ? 'You' : 'Assistant'}</span>
    <div class="message-controls">
      {#if isAssistant}
        <button
          class="control-btn"
          onclick={toggleRaw}
          title={showRaw ? 'Show formatted' : 'Show raw text'}
        >
          {showRaw ? '📝' : '📄'}
        </button>
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
  <div class="message-content">
    {#if renderedContent}
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

  .message-content :global(pre) {
    background-color: var(--bg-primary);
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    overflow-x: auto;
    margin: var(--space-6) 0;
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
</style>
