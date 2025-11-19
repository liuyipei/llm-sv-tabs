<script>
  import { getContext } from 'svelte';
  import { queryInput, urlInput, isLoading, addChatMessage } from '$stores/ui';

  const ipc = getContext('ipc');

  async function handleQuerySubmit() {
    if (!$queryInput.trim()) return;

    const query = $queryInput.trim();
    $queryInput = '';

    // Add user message to chat
    addChatMessage({
      id: Date.now(),
      role: 'user',
      content: query,
    });

    if (ipc) {
      isLoading.set(true);
      try {
        const response = await ipc.sendQuery(query);

        // Add assistant response to chat
        addChatMessage({
          id: Date.now() + 1,
          role: 'assistant',
          content: response.response || 'No response',
        });
      } catch (error) {
        addChatMessage({
          id: Date.now() + 1,
          role: 'assistant',
          content: `Error: ${error.message}`,
        });
      } finally {
        isLoading.set(false);
      }
    }
  }

  async function handleUrlSubmit() {
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

  function handleQueryKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleQuerySubmit();
    }
  }

  function handleUrlKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleUrlSubmit();
    }
  }
</script>

<div class="input-controls">
  <div class="url-input-container">
    <input
      type="text"
      bind:value={$urlInput}
      on:keydown={handleUrlKeydown}
      placeholder="Enter URL to open a new tab..."
      class="url-input"
    />
    <button on:click={handleUrlSubmit} class="url-submit-btn" disabled={!$urlInput.trim()}>
      Open
    </button>
  </div>

  <div class="query-input-container">
    <textarea
      bind:value={$queryInput}
      on:keydown={handleQueryKeydown}
      placeholder="Ask a question about your tabs... (Enter to send, Shift+Enter for new line)"
      class="query-input"
      rows="3"
    />
    <button
      on:click={handleQuerySubmit}
      class="query-submit-btn"
      disabled={!$queryInput.trim() || $isLoading}
    >
      {$isLoading ? 'Sending...' : 'Send'}
    </button>
  </div>
</div>

<style>
  .input-controls {
    padding: 20px;
    background-color: #252526;
    border-top: 1px solid #3e3e42;
  }

  .url-input-container,
  .query-input-container {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }

  .query-input-container {
    margin-bottom: 0;
  }

  .url-input,
  .query-input {
    flex: 1;
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 10px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }

  .url-input {
    height: 40px;
  }

  .url-input:focus,
  .query-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .url-submit-btn,
  .query-submit-btn {
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
  }

  .url-submit-btn:hover:not(:disabled),
  .query-submit-btn:hover:not(:disabled) {
    background-color: #005a9e;
  }

  .url-submit-btn:disabled,
  .query-submit-btn:disabled {
    background-color: #3e3e42;
    color: #808080;
    cursor: not-allowed;
  }

  .query-input {
    min-height: 80px;
  }
</style>
