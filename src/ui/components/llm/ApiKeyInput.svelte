<script lang="ts">
  import { apiKeys, provider as providerStore } from '../../stores/config.js';
  import type { ProviderType } from '../../../types';

  let showKey = $state(false);
  let showInstructions = $state(false);

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

  // API key instructions for popular providers
  const apiKeyInstructions = [
    {
      provider: 'OpenAI',
      url: 'https://platform.openai.com/api-keys',
    },
    {
      provider: 'Anthropic',
      url: 'https://console.anthropic.com/settings/keys',
    },
    {
      provider: 'OpenRouter',
      url: 'https://openrouter.ai/docs/api-reference/api-keys/create-keys',
    },
    {
      provider: 'Fireworks AI',
      url: 'https://docs.fireworks.ai/api-reference/create-api-key',
    },
    {
      provider: 'Google (Gemini / Vertex AI)',
      url: 'https://ai.google.dev/gemini-api/docs/api-key',
    },
    {
      provider: 'xAI (Grok)',
      url: 'https://docs.x.ai/docs/overview',
    },
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

  function toggleInstructions() {
    showInstructions = !showInstructions;
  }
</script>

{#if isRequired}
  <div class="api-key-input">
    <label for="api-key">API Key:</label>
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

    <button
      type="button"
      onclick={toggleInstructions}
      class="instructions-button"
    >
      {showInstructions ? '▼' : '▶'} Where to get API keys
    </button>

    {#if showInstructions}
      <div class="instructions-content">
        <table class="providers-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>API Key Creation URL</th>
            </tr>
          </thead>
          <tbody>
            {#each apiKeyInstructions as instruction}
              <tr>
                <td>{instruction.provider}</td>
                <td>
                  <a href={instruction.url} target="_blank" rel="noopener noreferrer">
                    {instruction.url}
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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

  .instructions-button {
    padding: 0.5rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--button-bg, white);
    color: var(--text-primary, #333);
    cursor: pointer;
    font-size: 0.875rem;
    text-align: left;
    transition: all 0.2s;
    margin-top: 0.25rem;
  }

  .instructions-button:hover {
    background: var(--button-hover-bg, #f5f5f5);
    border-color: var(--border-hover, #999);
  }

  .instructions-button:active {
    transform: scale(0.98);
  }

  .instructions-content {
    margin-top: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    background: var(--card-bg, #f9f9f9);
    overflow-x: auto;
  }

  .providers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .providers-table th {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 2px solid var(--border-color, #ddd);
    font-weight: 600;
    color: var(--text-secondary, #666);
  }

  .providers-table td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light, #eee);
    color: var(--text-primary, #333);
  }

  .providers-table tbody tr:last-child td {
    border-bottom: none;
  }

  .providers-table a {
    color: var(--primary-color, #0066cc);
    text-decoration: none;
    word-break: break-all;
  }

  .providers-table a:hover {
    text-decoration: underline;
  }

  .providers-table a:visited {
    color: var(--primary-color-visited, #551a8b);
  }
</style>
