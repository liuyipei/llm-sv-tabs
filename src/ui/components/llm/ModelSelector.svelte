<script lang="ts">
  import { model as modelStore, provider as providerStore, apiKeys, endpoint } from '../../stores/config.js';
  import { onMount, getContext } from 'svelte';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';
  import type { ProviderType } from '../../../types';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let models = $state<string[]>([]);
  let searchQuery = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  let filteredModels = $derived(
    searchQuery
      ? models.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
      : models
  );

  async function loadModels(provider: ProviderType, forceRefresh = false) {
    isLoading = true;
    error = null;

    try {
      if (ipc && forceRefresh) {
        // Try to fetch models from the provider
        const apiKey = $apiKeys[provider];
        const endpointUrl = $endpoint;
        const response = await ipc.discoverModels(provider, apiKey, endpointUrl);

        if ('success' in response && response.success && response.data) {
          models = response.data.map(m => m.id);
          if (models.length > 0) {
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
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load models';
      console.error('Error loading models:', err);
    } finally {
      isLoading = false;
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
    modelStore.set(target.value);
  }
</script>

<div class="model-selector">
  <div class="model-header">
    <label for="model-select">Model:</label>
    <button
      onclick={handleRefresh}
      class="refresh-btn"
      disabled={isLoading}
      title="Refresh models from provider"
    >
      ↻
    </button>
  </div>

  {#if isLoading}
    <div class="loading">Loading models...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <input
      type="text"
      placeholder="Search models..."
      bind:value={searchQuery}
      class="search-input"
    />

    <select
      id="model-select"
      value={$modelStore || ''}
      onchange={handleModelChange}
      class="model-select"
    >
      <option value="">Select a model</option>
      {#each filteredModels as model}
        <option value={model}>
          {model}
        </option>
      {/each}
    </select>

    {#if filteredModels.length === 0 && searchQuery}
      <div class="no-results">No models found</div>
    {/if}
  {/if}
</div>

<style>
  .model-selector {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .model-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .refresh-btn {
    background: none;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    color: var(--text-primary, #333);
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0.25rem 0.5rem;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--button-hover-bg, #f5f5f5);
    border-color: var(--border-hover, #999);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .search-input,
  .model-select {
    padding: 0.5rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--input-bg, white);
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .search-input {
    margin-bottom: 0.25rem;
  }

  .search-input:focus,
  .model-select:focus {
    outline: none;
    border-color: var(--primary-color, #0066cc);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
  }

  .model-select {
    cursor: pointer;
  }

  .model-select:hover {
    border-color: var(--border-hover, #999);
  }

  .loading,
  .error,
  .no-results {
    font-size: 0.875rem;
    padding: 0.5rem;
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
    position: relative;
    z-index: 10;
  }

  .no-results {
    color: var(--text-secondary, #666);
    font-style: italic;
  }
</style>
