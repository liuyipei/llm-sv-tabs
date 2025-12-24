<script lang="ts">
  import { endpoint, provider as providerStore } from '../../stores/config.js';
  import type { ProviderType } from '../../../types';

  // Providers that require endpoint configuration
  const requiresEndpoint: ProviderType[] = [
    'ollama',
    'lmstudio',
    'vllm',
    'local-openai-compatible',
  ];

  // Default endpoints for different providers
  const defaultEndpoints: Record<string, string> = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234',
    vllm: 'http://localhost:8000',
    'local-openai-compatible': 'http://localhost:8080',
  };

  const currentProvider = $derived($providerStore);
  const currentEndpoint = $derived($endpoint || '');
  const isRequired = $derived(requiresEndpoint.includes(currentProvider));
  const placeholder = $derived(defaultEndpoints[currentProvider] || 'http://localhost:8080');

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    endpoint.set(target.value);
  }

  function useDefault() {
    endpoint.set(defaultEndpoints[currentProvider] || '');
  }
</script>

{#if isRequired}
  <div class="endpoint-config">
    <label for="endpoint">Endpoint URL:</label>
    <div class="input-wrapper">
      <input
        id="endpoint"
        type="url"
        value={currentEndpoint}
        oninput={handleChange}
        placeholder={placeholder}
        class="endpoint-input"
      />
      {#if defaultEndpoints[currentProvider]}
        <button
          type="button"
          onclick={useDefault}
          class="default-button"
          title="Use default endpoint"
        >
          Default
        </button>
      {/if}
    </div>
    <div class="hint">
      Default: {placeholder}
    </div>
  </div>
{/if}

<style>
  .endpoint-config {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
  }

  .input-wrapper {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .endpoint-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    transition: border-color var(--transition-fast);
  }

  .endpoint-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }

  .default-button {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .default-button:hover {
    background: var(--bg-hover);
    border-color: var(--accent-color);
  }

  .default-button:active {
    transform: scale(0.95);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
