<script lang="ts">
  import { currentPipeline, config, log } from '$lib/stores/experiment';

  let provider = $state<'openai' | 'anthropic' | 'ollama'>('openai');
  let model = $state('gpt-4o');
  let prompt = $state('Extract all text from this image. Preserve formatting and structure.');
  let apiKey = $state('');
  let isRunning = $state(false);
  let result = $state('');

  const models = {
    openai: ['gpt-4o', 'gpt-4o-mini'],
    anthropic: ['claude-3-5-sonnet-20241022'],
    ollama: ['llava', 'llama3.2-vision'],
  };

  const prompts = [
    { label: 'Extract Text', value: 'Extract all text from this image. Preserve formatting and structure.' },
    { label: 'Summarize', value: 'Summarize the content of this document in 2-3 paragraphs.' },
    { label: 'Extract Tables', value: 'Extract any tables from this image as markdown tables.' },
    { label: 'Describe Layout', value: 'Describe the visual layout and structure of this document.' },
  ];

  async function handleExtract(): Promise<void> {
    if (!apiKey && provider !== 'ollama') {
      log('error', 'API key required for ' + provider);
      return;
    }

    isRunning = true;
    log('info', `Running LLM extraction with ${provider}/${model}`);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    result = `# Extracted Content (Demo)

This is a simulated extraction result. In the real implementation:

1. The selected image would be sent to ${provider}/${model}
2. The prompt "${prompt.slice(0, 50)}..." would be used
3. The response would appear here

## Implementation Notes

- OpenAI: Uses the Chat Completions API with vision
- Anthropic: Uses the Messages API with image blocks
- Ollama: Connects to local server at configured URL`;

    isRunning = false;
    log('info', 'Extraction complete');
  }
</script>

<div class="llm-panel">
  <h2 class="section-title">LLM Extraction</h2>

  {#if !$currentPipeline}
    <div class="empty-state">
      <p>Select a pipeline with rendered images to use LLM extraction.</p>
    </div>
  {:else}
    <div class="extraction-form">
      <!-- Provider -->
      <div class="form-group">
        <label class="form-label">Provider</label>
        <div class="provider-tabs">
          {#each ['openai', 'anthropic', 'ollama'] as p}
            <button
              class="provider-tab"
              class:active={provider === p}
              onclick={() => { provider = p as typeof provider; model = models[p][0]; }}
            >
              {p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'Ollama'}
            </button>
          {/each}
        </div>
      </div>

      <!-- Model -->
      <div class="form-group">
        <label class="form-label">Model</label>
        <select class="select-input" bind:value={model}>
          {#each models[provider] as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>

      <!-- API Key -->
      {#if provider !== 'ollama'}
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input
            type="password"
            class="text-input"
            placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
            bind:value={apiKey}
          />
        </div>
      {/if}

      <!-- Prompt -->
      <div class="form-group">
        <label class="form-label">Extraction Prompt</label>
        <div class="prompt-presets">
          {#each prompts as p}
            <button
              class="preset-btn"
              class:active={prompt === p.value}
              onclick={() => prompt = p.value}
            >
              {p.label}
            </button>
          {/each}
        </div>
        <textarea
          class="textarea-input"
          bind:value={prompt}
          rows="3"
        ></textarea>
      </div>

      <!-- Run Button -->
      <button class="run-btn" onclick={handleExtract} disabled={isRunning}>
        {isRunning ? 'Extracting...' : 'Extract with LLM'}
      </button>
    </div>

    <!-- Result -->
    {#if result}
      <div class="result-box">
        <h3>Extraction Result</h3>
        <pre class="result-text">{result}</pre>
      </div>
    {/if}
  {/if}
</div>

<style>
  .llm-panel {
    max-width: 700px;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-6);
  }

  .empty-state {
    padding: var(--space-8);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--text-tertiary);
  }

  .extraction-form {
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .form-group {
    margin-bottom: var(--space-4);
  }

  .form-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: var(--space-2);
  }

  .provider-tabs {
    display: flex;
    gap: var(--space-1);
    background-color: var(--bg-tertiary);
    padding: var(--space-1);
    border-radius: var(--radius-md);
  }

  .provider-tab {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .provider-tab:hover {
    color: var(--text-primary);
  }

  .provider-tab.active {
    background-color: var(--accent-color);
    color: white;
  }

  .select-input, .text-input {
    width: 100%;
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .prompt-presets {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: var(--space-1) var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .preset-btn:hover, .preset-btn.active {
    border-color: var(--accent-color);
    color: var(--accent-color);
  }

  .textarea-input {
    width: 100%;
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    resize: vertical;
  }

  .run-btn {
    width: 100%;
    padding: var(--space-4);
    background-color: var(--accent-color);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  .run-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .result-box {
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .result-box h3 {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-3);
  }

  .result-text {
    margin: 0;
    padding: var(--space-4);
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text-primary);
    white-space: pre-wrap;
    max-height: 400px;
    overflow-y: auto;
  }
</style>
