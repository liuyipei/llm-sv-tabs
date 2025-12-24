<script lang="ts">
  import { getContext } from 'svelte';
  import { apiKeys, provider as providerStore } from '../../stores/config.js';
  import type { ProviderType } from '../../../types';
  import type { IPCBridgeAPI } from '$lib/ipc-bridge';

  const ipc = getContext<IPCBridgeAPI>('ipc');

  let showKey = $state(false);

  // Providers that require API keys
  const requiresApiKey: ProviderType[] = [
    'openai',
    'anthropic',
    'gemini',
    'xai',
    'openrouter',
    'fireworks',
    'minimax',
  ];

  const currentProvider = $derived($providerStore);
  const currentApiKey = $derived($apiKeys[currentProvider] || '');
  const isRequired = $derived(requiresApiKey.includes(currentProvider));

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newKeys = { ...$apiKeys, [currentProvider]: target.value };
    apiKeys.set(newKeys);
  }

  function toggleShowKey() {
    showKey = !showKey;
  }

  async function openApiKeyInstructions() {
    if (ipc) {
      try {
        await ipc.openUrl('api-keys://instructions');
      } catch (error) {
        console.error('Failed to open API key instructions:', error);
      }
    }
  }
</script>

{#if isRequired}
  <div class="api-key-input">
    <div class="label-wrapper">
      <label for="api-key">API Key:</label>
      <button
        type="button"
        onclick={openApiKeyInstructions}
        class="info-icon"
        title="Where to get API keys"
        aria-label="Where to get API keys"
      >
        ℹ️
      </button>
    </div>
    <div class="input-wrapper">
      <input
        id="api-key"
        type={showKey ? 'text' : 'password'}
        value={currentApiKey}
        oninput={handleChange}
        placeholder="Enter your API key"
        class="key-input"
      />
      <button
        type="button"
        onclick={toggleShowKey}
        class="toggle-visibility"
        title={showKey ? 'Hide key' : 'Show key'}
      >
        {showKey ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
    {#if !currentApiKey}
      <div class="hint">Required for {currentProvider}</div>
    {/if}
  </div>
{/if}

<style>
  .api-key-input {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
  }

  .info-icon {
    background: none;
    border: none;
    font-size: var(--text-base);
    color: var(--accent-color);
    cursor: pointer;
    padding: var(--space-1);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 1.25rem;
    height: 1.25rem;
    transition: all var(--transition-fast);
  }

  .info-icon:hover {
    background: var(--bg-hover);
    transform: scale(1.1);
  }

  .info-icon:active {
    transform: scale(0.95);
  }

  .input-wrapper {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .key-input {
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

  .key-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }

  .toggle-visibility {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    cursor: pointer;
    font-size: var(--text-base);
    transition: all var(--transition-fast);
  }

  .toggle-visibility:hover {
    background: var(--bg-hover);
    border-color: var(--accent-color);
  }

  .toggle-visibility:active {
    transform: scale(0.95);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
