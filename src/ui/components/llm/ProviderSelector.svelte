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
    gap: var(--space-1);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
  }

  .provider-select {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .provider-select:hover {
    border-color: var(--accent-color);
  }

  .provider-select:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }
</style>
