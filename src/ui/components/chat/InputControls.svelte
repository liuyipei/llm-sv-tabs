<script lang="ts">
  import { getContext } from 'svelte';
  import { queryInput, isLoading, addChatMessage } from '$stores/ui';
  import { provider, model, apiKeys, endpoint, temperature, maxTokens, systemPrompt } from '$stores/config';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { QueryOptions } from '$types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  async function handleQuerySubmit(): Promise<void> {
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
        // Build query options from config stores
        const options: QueryOptions = {
          provider: $provider,
          model: $model || undefined,
          apiKey: $apiKeys[$provider] || undefined,
          endpoint: $endpoint || undefined,
          temperature: $temperature,
          maxTokens: $maxTokens,
          systemPrompt: $systemPrompt || undefined,
        };

        const response = await ipc.sendQuery(query, options);

        // Check for error in response
        if (response.error) {
          addChatMessage({
            id: Date.now() + 1,
            role: 'assistant',
            content: `Error: ${response.error}`,
          });
        } else {
          // Add assistant response to chat
          addChatMessage({
            id: Date.now() + 1,
            role: 'assistant',
            content: response.response || 'No response',
            stats: {
              tokensUsed: response.tokensUsed,
              responseTime: response.responseTime,
              model: response.model,
            },
          });
        }
      } catch (error) {
        addChatMessage({
          id: Date.now() + 1,
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        isLoading.set(false);
      }
    }
  }

  function handleQueryKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleQuerySubmit();
    }
  }
</script>

<div class="input-controls">
  <div class="query-input-container">
    <textarea
      bind:value={$queryInput}
      onkeydown={handleQueryKeydown}
      placeholder="Ask a question about your tabs... (Enter to send, Shift+Enter for new line)"
      class="query-input"
      rows="8"
    ></textarea>
    <button
      onclick={handleQuerySubmit}
      class="query-submit-btn"
      disabled={!$queryInput.trim() || $isLoading}
    >
      {$isLoading ? 'Sending...' : 'Send'}
    </button>
  </div>
</div>

<style>
  .input-controls {
    padding: 15px;
    background-color: #252526;
    border-top: 1px solid #3e3e42;
  }

  .query-input-container {
    display: flex;
    gap: 10px;
  }

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
    min-height: 150px;
  }

  .query-input:focus {
    outline: none;
    border-color: #007acc;
  }

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

  .query-submit-btn:hover:not(:disabled) {
    background-color: #005a9e;
  }

  .query-submit-btn:disabled {
    background-color: #3e3e42;
    color: #808080;
    cursor: not-allowed;
  }
</style>
