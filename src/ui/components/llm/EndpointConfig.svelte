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
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .input-wrapper {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .endpoint-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--input-bg, white);
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    font-family: monospace;
    transition: border-color 0.2s;
  }

  .endpoint-input:focus {
    outline: none;
    border-color: var(--primary-color, #0066cc);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
  }

  .default-button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--button-bg, white);
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .default-button:hover {
    background: var(--button-hover-bg, #f5f5f5);
    border-color: var(--border-hover, #999);
  }

  .default-button:active {
    transform: scale(0.95);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted, #999);
    font-style: italic;
  }
</style>
