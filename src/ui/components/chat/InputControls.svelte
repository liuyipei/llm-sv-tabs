<script lang="ts">
  import { getContext } from 'svelte';
  import { queryInput, isLoading } from '$stores/ui';
  import { provider, model, apiKeys, endpoint, temperature, maxTokens, systemPrompt } from '$stores/config';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { QueryOptions } from '$types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  async function handleQuerySubmit(): Promise<void> {
    if (!$queryInput.trim()) return;

    const query = $queryInput.trim();
    $queryInput = '';

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

        // Create a tab with the LLM response
        const timestamp = Date.now();
        const responseUrl = `llm-response://${timestamp}`;

        // Check for error in response
        if (response.error) {
          await ipc.openUrl(responseUrl);
          console.error('LLM Error:', response.error);
        } else {
          await ipc.openUrl(responseUrl);
        }
      } catch (error) {
        console.error('Failed to send query:', error);
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
      title={$isLoading ? 'Sending...' : 'Send (Enter)'}
    >
      {$isLoading ? '⏳' : '➤'}
    </button>
  </div>
</div>

<style>
  .input-controls {
    flex: 1;
    padding: 15px;
    background-color: #252526;
    display: flex;
    flex-direction: column;
  }

  .query-input-container {
    position: relative;
    display: flex;
    flex: 1;
  }

  .query-input {
    flex: 1;
    background-color: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    padding: 10px 50px 10px 10px;
    font-family: inherit;
    font-size: 14px;
    resize: none;
    min-height: 100px;
  }

  .query-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .query-submit-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 18px;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
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
