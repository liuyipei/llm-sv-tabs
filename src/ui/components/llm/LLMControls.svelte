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
    padding: var(--space-4);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    overflow-y: auto;
    height: 100%;
    gap: var(--space-2);
  }

  h3 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }
</style>
