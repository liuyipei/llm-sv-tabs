<script lang="ts">
  import {
    model as modelStore,
    provider as providerStore,
    apiKeys,
    endpoint,
    discoveredModels,
    saveDiscoveredModels,
    getDiscoveredModels,
    selectedModelByProvider,
    saveSelectedModelForProvider,
    getSelectedModelForProvider,
    addQuickSwitchModel,
    selectedQuickSwitchIndex,
    truncateModelName
  } from '../../stores/config.js';
  import { onMount, getContext } from 'svelte';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { ProviderType } from '../../../types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let models = $state<string[]>([]);
  let searchQuery = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let copySuccess = $state(false);
  let modelsSource = $state<'cached' | 'api' | 'default'>('default');
  let addMessage = $state<string | null>(null);

  let filteredModels = $derived(
    searchQuery
      ? models.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
      : models
  );

  async function loadModels(provider: ProviderType, forceRefresh = false) {
    isLoading = true;
    error = null;

    try {
      // Try loading from cache first if not forcing refresh
      if (!forceRefresh) {
        const cachedModels = getDiscoveredModels(provider, $discoveredModels);
        if (cachedModels && cachedModels.length > 0) {
          models = cachedModels.map(m => m.id);
          modelsSource = 'cached';
          isLoading = false;
          return;
        }
      }

      // Try to fetch models from the provider API
      if (ipc) {
        const apiKey = $apiKeys[provider];
        const endpointUrl = $endpoint;
        const response = await ipc.discoverModels(provider, apiKey, endpointUrl);

        if ('success' in response && response.success && response.data) {
          const discoveredModelList = response.data;
          if (discoveredModelList.length > 0) {
            models = discoveredModelList.map(m => m.id);
            modelsSource = 'api';
            // Save to cache
            saveDiscoveredModels(provider, discoveredModelList);
            isLoading = false;
            return;
          }
        }
      }

      // Fall back to static defaults
      const defaultModels: Record<string, string[]> = {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
        anthropic: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
        ],
        gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        xai: ['grok-2-latest', 'grok-2-vision-latest'],
        fireworks: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/llama-v3p1-405b-instruct'],
        ollama: ['llama3.2', 'mistral', 'codellama', 'phi3'],
        lmstudio: ['local-model'],
        vllm: ['default'],
        'local-openai-compatible': ['default'],
        openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
        minimax: ['abab6.5-chat'],
      };

      models = defaultModels[provider] || ['default'];
      modelsSource = 'default';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load models';
      console.error('Error loading models:', err);
      modelsSource = 'default';
    } finally {
      isLoading = false;
      // Restore the previously selected model for this provider
      const previousModel = getSelectedModelForProvider(provider, $selectedModelByProvider);
      if (previousModel && models.includes(previousModel)) {
        modelStore.set(previousModel);
      } else if (models.length > 0 && !$modelStore) {
        // If no previous selection and no current model, select the first available
        modelStore.set(models[0]);
      }
    }
  }

  function handleRefresh() {
    loadModels($providerStore as ProviderType, true);
  }

  onMount(() => {
    const unsubscribe = providerStore.subscribe(provider => {
      loadModels(provider as ProviderType, false);
    });
    return unsubscribe;
  });

  function handleModelChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const selectedModel = target.value;
    modelStore.set(selectedModel);
    // Also save the selection for this provider
    if (selectedModel) {
      saveSelectedModelForProvider($providerStore as ProviderType, selectedModel);
    }
  }

  async function handleCopyModel() {
    const modelName = $modelStore;
    if (!modelName) return;

    try {
      await navigator.clipboard.writeText(modelName);
      copySuccess = true;
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy model name:', err);
    }
  }

  function handleAddToQuickList() {
    const modelName = $modelStore;
    const providerName = $providerStore as ProviderType;
    if (!modelName) return;

    const result = addQuickSwitchModel(providerName, modelName);

    if (result.movedToTop) {
      addMessage = 'Moved to top of list';
      // Select the model (now at index 0)
      selectedQuickSwitchIndex.set(0);
    } else if (result.added) {
      addMessage = 'Added to quick list';
      // Select the newly added model (at index 0)
      selectedQuickSwitchIndex.set(0);
    } else {
      addMessage = 'Already at top';
    }

    setTimeout(() => {
      addMessage = null;
    }, 2000);
  }
</script>

<div class="model-selector">
  <div class="model-header">
    <div class="label-group">
      <label for="model-select">Model:</label>
      {#if modelsSource === 'cached'}
        <span class="source-indicator" title="Models loaded from cache">💾</span>
      {:else if modelsSource === 'api'}
        <span class="source-indicator" title="Models loaded from API">🌐</span>
      {:else}
        <span class="source-indicator" title="Using default models">📋</span>
      {/if}
      <button
        onclick={handleRefresh}
        class="refresh-btn"
        disabled={isLoading}
        title="Refresh models from provider"
      >
        ↻
      </button>
    </div>
  </div>

  {#if isLoading}
    <div class="loading">Loading...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="model-grid">
      <div class="model-inputs">
        <select
          id="model-select"
          value={$modelStore || ''}
          onchange={handleModelChange}
          class="model-select"
          title={$modelStore || 'Select a model'}
        >
          <option value="">Select a model</option>
          {#each filteredModels as model}
            <option value={model} title={model}>
              {truncateModelName(model, 40)}
            </option>
          {/each}
        </select>

        <input
          type="text"
          placeholder="Search models..."
          bind:value={searchQuery}
          class="search-input"
        />
      </div>

      <button
        onclick={handleAddToQuickList}
        class="add-btn"
        disabled={!$modelStore}
        title="Add to quick list"
      >
        +
      </button>
    </div>

    {#if filteredModels.length === 0 && searchQuery}
      <div class="no-results">No models found</div>
    {/if}

    {#if addMessage}
      <div class="add-message">{addMessage}</div>
    {/if}
  {/if}
</div>

<style>
  .model-selector {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-width: 100%;
    overflow: hidden;
  }

  .model-header {
    display: flex;
    align-items: center;
  }

  .label-group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .source-indicator {
    font-size: 0.7rem;
    opacity: 0.7;
  }

  .refresh-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #666);
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.125rem 0.25rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    color: var(--primary-color, #0066cc);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .model-grid {
    display: flex;
    gap: 0.25rem;
    align-items: stretch;
    max-width: 100%;
    overflow: hidden;
  }

  .model-inputs {
    flex: 1;
    min-width: 0; /* Allow flex child to shrink below content size */
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    overflow: hidden;
  }

  .search-input,
  .model-select {
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--input-bg, white);
    color: var(--text-primary, #333);
    font-family: monospace;
    font-size: 0.7rem;
    transition: border-color 0.2s;
  }

  .search-input:focus,
  .model-select:focus {
    outline: none;
    border-color: var(--primary-color, #0066cc);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
  }

  .model-select {
    cursor: pointer;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-select:hover {
    border-color: var(--border-hover, #999);
  }

  .search-input {
    max-width: 100%;
    min-width: 0;
  }

  .search-input::placeholder {
    font-family: monospace;
    font-size: 0.65rem;
  }

  .add-btn {
    width: 2.5rem;
    min-width: 2.5rem;
    border: 1px solid var(--primary-color, #0066cc);
    border-radius: 4px;
    background: var(--primary-color, #0066cc);
    color: white;
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-btn:hover:not(:disabled) {
    background: var(--primary-color-dark, #005a9e);
    border-color: var(--primary-color-dark, #005a9e);
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading,
  .error,
  .no-results {
    font-size: 0.75rem;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .loading {
    color: var(--text-secondary, #666);
    background: var(--bg-secondary, #f5f5f5);
  }

  .error {
    color: #f48771;
    background: rgba(244, 135, 113, 0.15);
    border: 1px solid rgba(244, 135, 113, 0.3);
  }

  .no-results {
    color: var(--text-secondary, #666);
    font-style: italic;
  }

  .add-message {
    margin-top: 0.125rem;
    padding: 0.25rem;
    font-size: 0.7rem;
    color: #4ec9b0;
    background: rgba(78, 201, 176, 0.1);
    border: 1px solid rgba(78, 201, 176, 0.3);
    border-radius: 4px;
    text-align: center;
  }
</style>
