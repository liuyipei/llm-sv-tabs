<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import { queryInput, isLoading, activeSidebarView, showModelSelectionWarning } from '$stores/ui';
  import {
    provider,
    model,
    apiKeys,
    endpoint,
    maxTokens,
    systemPrompt,
    recordModelUsage,
    quickSwitchModels,
    selectedQuickSwitchIndex,
    getSelectedQuickSwitchModel
  } from '$stores/config';
  import { selectedTabs } from '$stores/tabs';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { QueryOptions, LLMResponse } from '../../../types';

  const ipc = getContext<IPCBridgeAPI>('ipc');
  const setFocusLLMInputCallback = getContext<(callback: () => void) => void>('setFocusLLMInputCallback');

  // Reference to the query input element
  let queryInputElement: HTMLTextAreaElement;
  let showNoModelWarning = $state(false);

  // Derive the selected quick-switch model
  const selectedModel = $derived(
    getSelectedQuickSwitchModel($quickSwitchModels, $selectedQuickSwitchIndex)
  );
  const hasNoModels = $derived($quickSwitchModels.length === 0);

  async function handleQuerySubmit(): Promise<void> {
    if (!$queryInput.trim()) return;

    // Check if a model is selected from the quick-switch list
    if (!selectedModel) {
      showNoModelWarning = true;
      showModelSelectionWarning.set(true);
      // Switch to settings view and open API key instructions
      activeSidebarView.set('settings');
      if (ipc) {
        await ipc.openUrl('api-keys://instructions');
      }
      // Hide warning after a few seconds
      setTimeout(() => {
        showNoModelWarning = false;
        showModelSelectionWarning.set(false);
      }, 5000);
      return;
    }

    const query = $queryInput.trim();
    $queryInput = '';

    if (ipc) {
      isLoading.set(true);

      // Create tab immediately with query only (streaming-ready design)
      const tabResult = await ipc.openLLMResponseTab(query);
      const tabId = 'data' in tabResult && tabResult.data ? tabResult.data.tabId : ('tabId' in tabResult ? tabResult.tabId : undefined);

      try {
        // Build query options using the selected quick-switch model
        const options: QueryOptions = {
          provider: selectedModel.provider,
          model: selectedModel.model,
          apiKey: $apiKeys[selectedModel.provider] || undefined,
          endpoint: $endpoint || undefined,
          maxTokens: $maxTokens,
          systemPrompt: $systemPrompt || undefined,
          selectedTabIds: Array.from($selectedTabs),
          tabId: tabId, // Pass the tab ID to avoid duplicate creation
        };

        const response = await ipc.sendQuery(query, options) as LLMResponse;

        // Record model usage if we got a valid response
        if (response.model && !response.error) {
          recordModelUsage(response.model, selectedModel.provider);
        }

        // Update the tab with the response
        if (tabId) {
          if (response.error) {
            await ipc.updateLLMResponseTab(tabId, '', {
              error: response.error,
              tokensIn: response.tokensIn,
              tokensOut: response.tokensOut,
              model: response.model,
              selectedTabIds: options.selectedTabIds,
              fullQuery: response.fullQuery,
            });
            console.error('LLM Error:', response.error);
          } else {
            await ipc.updateLLMResponseTab(tabId, response.response, {
              tokensIn: response.tokensIn,
              tokensOut: response.tokensOut,
              model: response.model,
              selectedTabIds: options.selectedTabIds,
              fullQuery: response.fullQuery,
            });
          }
        }
      } catch (error) {
        console.error('Failed to send query:', error);
        // Update tab with error if we have a tabId
        if (tabId) {
          await ipc.updateLLMResponseTab(tabId, '', {
            error: String(error),
          });
        }
      } finally {
        // Belt-and-suspenders: force streaming state to end in the UI even
        // if the main-process completion signal was dropped.
        if (tabId) {
          await ipc.updateLLMMetadata(tabId, { isStreaming: false });
        }
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

  function focusQueryInputElement(): void {
    if (queryInputElement) {
      queryInputElement.focus();
      // For textarea, select all text if there's any
      queryInputElement.select();
    }
  }

  // Register focus callback on mount
  onMount(() => {
    if (setFocusLLMInputCallback) {
      setFocusLLMInputCallback(focusQueryInputElement);
    }
  });
</script>

<div class="input-controls">
  {#if showNoModelWarning}
    <div class="no-model-warning">
      {#if hasNoModels}
        No models added. Go to LLM Configuration, select a provider and model, then click "Add to Quick List".
      {:else}
        Please select a model from the dropdown above.
      {/if}
    </div>
  {/if}
  <div class="query-input-container">
    <textarea
      bind:this={queryInputElement}
      bind:value={$queryInput}
      onkeydown={handleQueryKeydown}
      placeholder="Ask a question about your tabs... (Enter to send, Shift+Enter for new line)"
      class="query-input"
      rows="8"
      title="LLM Query (Ctrl+. to focus)"
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

  .no-model-warning {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background-color: rgba(244, 135, 113, 0.15);
    border: 1px solid rgba(244, 135, 113, 0.5);
    border-radius: 4px;
    color: #f48771;
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
