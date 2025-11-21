<script lang="ts">
  import type { ChatMessage } from '../../../types';
  import { renderMarkdown, copyToClipboard } from '../../utils/markdown';

  let { message }: { message: ChatMessage } = $props();

  const isUser = $derived(message.role === 'user');
  const isAssistant = $derived(message.role === 'assistant');
  const isError = $derived(message.content.startsWith('Error:'));

  let showRaw = $state(false);
  let copyFeedback = $state(false);

  const renderedContent = $derived(
    isAssistant && !showRaw ? renderMarkdown(message.content) : null
  );

  async function handleCopy() {
    const success = await copyToClipboard(message.content);
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
      {message.content}
    {/if}
  </div>
</div>

<style>
  .chat-message {
    margin-bottom: 20px;
    padding: 15px;
    border-radius: 8px;
    background-color: #2d2d30;
  }

  .chat-message.user {
    background-color: #094771;
    margin-left: 20%;
  }

  .chat-message.assistant {
    background-color: #2d2d30;
    margin-right: 20%;
  }

  .chat-message.error {
    background-color: rgba(244, 135, 113, 0.15);
    border: 2px solid rgba(244, 135, 113, 0.5);
    margin-right: 10%;
    position: relative;
    z-index: 100;
  }

  .chat-message.error .role {
    color: #f48771;
  }

  .chat-message.error .message-content {
    color: #f48771;
  }

  .message-header {
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .role {
    font-size: 12px;
    font-weight: 600;
    color: #007acc;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chat-message.user .role {
    color: #4fc3f7;
  }

  .message-controls {
    display: flex;
    gap: 8px;
  }

  .control-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 14px;
    opacity: 0.7;
    transition: opacity 0.2s;
    border-radius: 4px;
  }

  .control-btn:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .message-content {
    font-size: 14px;
    line-height: 1.6;
    color: #d4d4d4;
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
    margin-top: 16px;
    margin-bottom: 8px;
    font-weight: 600;
    color: #e0e0e0;
  }

  .message-content :global(h1) { font-size: 1.8em; }
  .message-content :global(h2) { font-size: 1.5em; }
  .message-content :global(h3) { font-size: 1.3em; }

  .message-content :global(p) {
    margin: 8px 0;
  }

  .message-content :global(ul),
  .message-content :global(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  .message-content :global(li) {
    margin: 4px 0;
  }

  .message-content :global(code.inline-code) {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
  }

  .message-content :global(pre) {
    background-color: #1e1e1e;
    padding: 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .message-content :global(pre code) {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  .message-content :global(blockquote) {
    border-left: 4px solid #007acc;
    padding-left: 12px;
    margin: 12px 0;
    color: #b0b0b0;
    font-style: italic;
  }

  .message-content :global(a) {
    color: #4fc3f7;
    text-decoration: none;
  }

  .message-content :global(a:hover) {
    text-decoration: underline;
  }

  .message-content :global(table) {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
  }

  .message-content :global(th),
  .message-content :global(td) {
    border: 1px solid #3e3e42;
    padding: 8px;
    text-align: left;
  }

  .message-content :global(th) {
    background-color: #2d2d30;
    font-weight: 600;
  }

  /* Math error styling */
  .message-content :global(.math-error) {
    color: #f48771;
    font-family: monospace;
  }
</style>
