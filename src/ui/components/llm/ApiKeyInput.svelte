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
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .label-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }

  .info-icon {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--primary-color, #0066cc);
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 1.5rem;
    height: 1.5rem;
    transition: all 0.2s;
  }

  .info-icon:hover {
    background: var(--button-hover-bg, #e8f2ff);
    transform: scale(1.1);
  }

  .info-icon:active {
    transform: scale(0.95);
  }

  .input-wrapper {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .key-input {
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

  .key-input:focus {
    outline: none;
    border-color: var(--primary-color, #0066cc);
    box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
  }

  .toggle-visibility {
    padding: 0.5rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--button-bg, white);
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .toggle-visibility:hover {
    background: var(--button-hover-bg, #f5f5f5);
    border-color: var(--border-hover, #999);
  }

  .toggle-visibility:active {
    transform: scale(0.95);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted, #999);
    font-style: italic;
  }
</style>
