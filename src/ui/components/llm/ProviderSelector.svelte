<script lang="ts">
  import { provider as providerStore } from '../../stores/config.js';
  import type { ProviderType } from '../../../types';

  const providers: { value: ProviderType; label: string; requiresKey: boolean; requiresEndpoint: boolean }[] = [
    { value: 'openai', label: 'OpenAI', requiresKey: true, requiresEndpoint: false },
    { value: 'anthropic', label: 'Anthropic (Claude)', requiresKey: true, requiresEndpoint: false },
    { value: 'gemini', label: 'Google Gemini', requiresKey: true, requiresEndpoint: false },
    { value: 'xai', label: 'xAI (Grok)', requiresKey: true, requiresEndpoint: false },
    { value: 'openrouter', label: 'OpenRouter', requiresKey: true, requiresEndpoint: false },
    { value: 'fireworks', label: 'Fireworks AI', requiresKey: true, requiresEndpoint: false },
    { value: 'ollama', label: 'Ollama (Local)', requiresKey: false, requiresEndpoint: true },
    { value: 'lmstudio', label: 'LM Studio (Local)', requiresKey: false, requiresEndpoint: true },
    { value: 'vllm', label: 'vLLM (Local)', requiresKey: false, requiresEndpoint: true },
    { value: 'minimax', label: 'Minimax', requiresKey: true, requiresEndpoint: false },
    { value: 'local-openai-compatible', label: 'OpenAI-Compatible', requiresKey: false, requiresEndpoint: true },
  ];

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    providerStore.set(target.value as ProviderType);
  }
</script>

<div class="provider-selector">
  <label for="provider-select">Provider:</label>
  <select
    id="provider-select"
    value={$providerStore}
    onchange={handleChange}
    class="provider-select"
  >
    {#each providers as provider}
      <option value={provider.value}>
        {provider.label}
      </option>
    {/each}
  </select>
</div>

<style>
  .provider-selector {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .provider-select {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--input-bg, white);
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .provider-select:hover {
    border-color: var(--border-hover, #999);
  }

  .provider-select:focus {
    outline: none;
    border-color: var(--primary-color, #0066cc);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
  }
</style>
