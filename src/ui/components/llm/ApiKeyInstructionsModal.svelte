<script lang="ts">
  interface ApiKeyInstruction {
    provider: string;
    url: string;
  }

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  const apiKeyInstructions: ApiKeyInstruction[] = [
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

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modal-title">Where to get API Keys</h2>
        <button
          type="button"
          class="close-button"
          onclick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>
      </div>
      <div class="modal-body">
        <p class="description">
          Get your API keys from the following providers to use their services:
        </p>
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
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-primary, white);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 700px;
    width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color, #ddd);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-secondary, #666);
    cursor: pointer;
    padding: 0.25rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: var(--button-hover-bg, #f5f5f5);
    color: var(--text-primary, #333);
  }

  .close-button:active {
    transform: scale(0.95);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
  }

  .description {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary, #666);
  }

  .providers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .providers-table th {
    text-align: left;
    padding: 0.75rem;
    border-bottom: 2px solid var(--border-color, #ddd);
    font-weight: 600;
    color: var(--text-secondary, #666);
    background: var(--bg-secondary, #f9f9f9);
  }

  .providers-table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light, #eee);
    color: var(--text-primary, #333);
  }

  .providers-table tbody tr:last-child td {
    border-bottom: none;
  }

  .providers-table tbody tr:hover {
    background: var(--bg-secondary, #f9f9f9);
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
