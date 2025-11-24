<script lang="ts">
  interface ApiKeyInstruction {
    provider: string;
    url: string;
    visionSupport: 'Full' | 'Partial' | 'No';
    visionNote?: string;
  }

  const apiKeyInstructions: ApiKeyInstruction[] = [
    {
      provider: 'OpenAI',
      url: 'https://www.google.com/search?q=OpenAI+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Full',
      visionNote: 'GPT-4o, GPT-4 Turbo support images',
    },
    {
      provider: 'Anthropic',
      url: 'https://www.google.com/search?q=Anthropic+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Full',
      visionNote: 'Claude 3.5 Sonnet, Claude 3 Opus/Sonnet support images',
    },
    {
      provider: 'OpenRouter',
      url: 'https://www.google.com/search?q=OpenRouter+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Full',
      visionNote: 'Routes to vision models (Claude, GPT-4o, Gemini, etc.)',
    },
    {
      provider: 'Fireworks AI',
      url: 'https://www.google.com/search?q=Fireworks+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Full',
      visionNote: 'Qwen VL and other vision models',
    },
    {
      provider: 'Google (Gemini / Vertex AI)',
      url: 'https://www.google.com/search?q=Google+Gemini+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Partial',
      visionNote: 'Gemini vision models (text fallback currently)',
    },
    {
      provider: 'xAI (Grok)',
      url: 'https://www.google.com/search?q=xAI+API+key+%22dashboard%22+OR+%22console%22+OR+%22keys%22+OR+%22settings%22+official+site',
      visionSupport: 'Full',
      visionNote: 'Grok 2 Vision and Grok Vision models',
    },
  ];
</script>

<div class="api-key-instructions-page">
  <div class="content">
    <h1>Where to get API Keys</h1>
    <p class="description">
      Get your API keys from the following providers to use their services.
      Upload images to use vision models (select image tab with your query).
    </p>
    <p class="note">
      Note: API key URLs change frequently, so we provide Google searches instead of direct links.
    </p>
    <table class="providers-table">
      <thead>
        <tr>
          <th>Provider</th>
          <th>Vision Support</th>
          <th>Find API key console</th>
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
                🔍 Find console
              </a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .api-key-instructions-page {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #1e1e1e;
    color: #d4d4d4;
    padding: 2rem;
  }

  .content {
    max-width: 900px;
    margin: 0 auto;
  }

  h1 {
    margin: 0 0 1rem 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: #d4d4d4;
  }

  .description {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    color: #cccccc;
    line-height: 1.5;
  }

  .note {
    margin: 0 0 1.5rem 0;
    font-size: 0.85rem;
    color: #999999;
    font-style: italic;
  }

  .providers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    background-color: #252526;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    overflow: hidden;
  }

  .providers-table th {
    text-align: left;
    padding: 0.875rem;
    border-bottom: 2px solid #3e3e42;
    font-weight: 600;
    color: #cccccc;
    background: #2d2d30;
  }

  .providers-table td {
    padding: 0.875rem;
    border-bottom: 1px solid #3e3e42;
    color: #d4d4d4;
  }

  .providers-table tbody tr:last-child td {
    border-bottom: none;
  }

  .providers-table tbody tr:hover {
    background: #2d2d30;
  }

  .providers-table a {
    color: #4fc3f7;
    text-decoration: none;
  }

  .providers-table a:hover {
    text-decoration: underline;
    color: #81d4fa;
  }

  .search-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    background-color: #007acc;
    color: white !important;
    text-decoration: none !important;
    transition: background-color 0.2s;
    font-weight: 500;
  }

  .search-link:hover {
    background-color: #005a9e !important;
    text-decoration: none !important;
  }

  .vision-badge {
    display: inline-block;
    padding: 0.1875rem 0.5rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 600;
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
    margin-top: 0.375rem;
    font-size: 0.8rem;
    color: #999999;
    font-style: italic;
  }
</style>
