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
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
  }

  .modal-content {
    position: relative;
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
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary, #666);
  }

  .apology {
    margin: 0 0 1rem 0;
    font-size: 0.8rem;
    color: var(--text-tertiary, #999);
    font-style: italic;
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

  .search-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .search-link:hover {
    background-color: var(--bg-secondary, #f0f0f0);
    text-decoration: none;
  }

  .vision-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .vision-badge.vision-full {
    background: #d4edda;
    color: #155724;
  }

  .vision-badge.vision-partial {
    background: #fff3cd;
    color: #856404;
  }

  .vision-badge.vision-no {
    background: #f8d7da;
    color: #721c24;
  }

  .vision-note {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-tertiary, #999);
    font-style: italic;
  }
</style>
