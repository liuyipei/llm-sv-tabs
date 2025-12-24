<script lang="ts">
  interface ApiKeyInstruction {
    provider: string;
    url: string;
    visionSupport: 'Full' | 'Partial' | 'No';
    visionNote?: string;
  }

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  // Portal action to move element to document.body
  function portal(node: HTMLElement) {
    const target = document.body;

    // Move the node to body immediately
    target.appendChild(node);

    return {
      destroy() {
        // Clean up when the modal component is destroyed
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  const apiKeyInstructions: ApiKeyInstruction[] = [
    {
      provider: 'OpenAI',
      url: 'https://www.google.com/search?q=OpenAI+API+key+console',
      visionSupport: 'Full',
      visionNote: 'GPT-4o, GPT-4 Turbo support images',
    },
    {
      provider: 'Anthropic',
      url: 'https://www.google.com/search?q=Anthropic+API+key+console',
      visionSupport: 'Full',
      visionNote: 'Claude 3.5 Sonnet, Claude 3 Opus/Sonnet support images',
    },
    {
      provider: 'OpenRouter',
      url: 'https://www.google.com/search?q=OpenRouter+API+key+console',
      visionSupport: 'Full',
      visionNote: 'Routes to vision models (Claude, GPT-4o, Gemini, etc.)',
    },
    {
      provider: 'Fireworks AI',
      url: 'https://www.google.com/search?q=Fireworks+API+key+console',
      visionSupport: 'Full',
      visionNote: 'Qwen VL and other vision models',
    },
    {
      provider: 'Google (Gemini / Vertex AI)',
      url: 'https://www.google.com/search?q=Google+Gemini+API+key+console',
      visionSupport: 'Partial',
      visionNote: 'Gemini vision models (text fallback currently)',
    },
    {
      provider: 'xAI (Grok)',
      url: 'https://www.google.com/search?q=xAI+API+key+console',
      visionSupport: 'Full',
      visionNote: 'Grok 2 Vision and Grok Vision models',
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
    use:portal
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
          Get your API keys from the following providers to use their services.
          Upload images to use vision models (select image tab with your query).
        </p>
        <p class="apology">
          Note: API key URLs change frequently, so we provide Google searches instead of direct links.
        </p>
        <table class="providers-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Vision Support</th>
              <th>Search for API Key</th>
            </tr>
          </thead>
          <tbody>
            {#each apiKeyInstructions as instruction}
              <tr>
                <td>{instruction.provider}</td>
                <td>
                  <span class="vision-badge vision-{instruction.visionSupport.toLowerCase()}">
                    {instruction.visionSupport}
                  </span>
                  {#if instruction.visionNote}
                    <div class="vision-note">{instruction.visionNote}</div>
                  {/if}
                </td>
                <td>
                  <a href={instruction.url} target="_blank" rel="noopener noreferrer" class="search-link">
                    🔍 Search Google
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
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: var(--space-8);
  }

  .modal-content {
    position: relative;
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
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
    padding: var(--space-10);
    border-bottom: 1px solid var(--border-color);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }

  .close-button {
    background: none;
    border: none;
    font-size: var(--text-2xl);
    color: var(--text-secondary);
    cursor: pointer;
    padding: var(--space-2);
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .close-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .close-button:active {
    transform: scale(0.95);
  }

  .modal-body {
    padding: var(--space-10);
    overflow-y: auto;
  }

  .description {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--text-base);
    color: var(--text-secondary);
  }

  .apology {
    margin: 0 0 var(--space-8) 0;
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    font-style: italic;
  }

  .providers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-base);
  }

  .providers-table th {
    text-align: left;
    padding: var(--space-6);
    border-bottom: 2px solid var(--border-color);
    font-weight: var(--font-semibold);
    color: var(--text-secondary);
    background: var(--bg-secondary);
  }

  .providers-table td {
    padding: var(--space-6);
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  .providers-table tbody tr:last-child td {
    border-bottom: none;
  }

  .providers-table tbody tr:hover {
    background: var(--bg-secondary);
  }

  .providers-table a {
    color: var(--link-color);
    text-decoration: none;
    word-break: break-all;
  }

  .providers-table a:hover {
    text-decoration: underline;
  }

  .providers-table a:visited {
    color: var(--semantic-purple);
  }

  .search-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .search-link:hover {
    background-color: var(--bg-secondary);
    text-decoration: none;
  }

  .vision-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-default);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .vision-badge.vision-full {
    background: #2e7d32;
    color: #c8e6c9;
  }

  .vision-badge.vision-partial {
    background: #f57c00;
    color: #ffe0b2;
  }

  .vision-badge.vision-no {
    background: #c62828;
    color: #ffcdd2;
  }

  .vision-note {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    font-style: italic;
  }
</style>
