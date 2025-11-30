<script lang="ts">
  import ProviderSelector from './ProviderSelector.svelte';
  import ModelSelector from './ModelSelector.svelte';
  import ApiKeyInput from './ApiKeyInput.svelte';
  import EndpointConfig from './EndpointConfig.svelte';
</script>

<div class="llm-controls">
  <h3>LLM Configuration</h3>
  <ProviderSelector />
  <ApiKeyInput />
  <EndpointConfig />
  <ModelSelector />
</div>

<style>
  .llm-controls {
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color, #ddd);
    background: var(--bg-secondary, #f9f9f9);
    overflow-y: auto;
    height: 100%;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }
</style>
