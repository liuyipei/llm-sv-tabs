<script lang="ts">
  import {
    quickSwitchModels,
    selectedQuickSwitchIndex,
    removeQuickSwitchModel,
    formatQuickSwitchModel,
    addQuickSwitchModel,
    apiKeys,
    discoveredModels,
    type QuickSwitchModel
  } from '../../stores/config.js';
  import { showModelSelectionWarning } from '../../stores/ui.js';
  import type { ProviderType } from '../../../types';

  // Default models for each provider (fallback when no discovered models)
  const defaultModels: Record<ProviderType, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    xai: ['grok-2-latest', 'grok-2-vision-latest'],
    fireworks: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
    ollama: ['llama3.2', 'mistral', 'codellama'],
    lmstudio: ['local-model'],
    vllm: ['default'],
    'local-openai-compatible': ['default'],
    openrouter: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
    minimax: ['abab6.5-chat'],
  };

  // Providers that require API keys
  const providersRequiringApiKey: ProviderType[] = [
    'openai', 'anthropic', 'gemini', 'xai', 'openrouter', 'fireworks', 'minimax'
  ];

  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement;
  let autoAddMessage = $state<string | null>(null);
  const isWarning = $derived($showModelSelectionWarning);

  const models = $derived($quickSwitchModels);
  const selectedIndex = $derived($selectedQuickSwitchIndex);
  const selectedModel = $derived(
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < models.length
      ? models[selectedIndex]
      : null
  );
  const isEmpty = $derived(models.length === 0);

  function handleSelect(index: number) {
    selectedQuickSwitchIndex.set(index);
    isOpen = false;
  }

  function handleRemove(event: MouseEvent, index: number) {
    event.stopPropagation();
    removeQuickSwitchModel(index);
  }

  function toggleDropdown() {
    if (!isEmpty) {
      isOpen = !isOpen;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  function handleAutoAdd() {
    const keys = $apiKeys;
    const discovered = $discoveredModels;
    let addedCount = 0;

    // For each provider that has an API key
    for (const provider of providersRequiringApiKey) {
      if (keys[provider]) {
        // Get the first model: prefer discovered, fall back to defaults
        const providerDiscovered = discovered[provider];
        let modelToAdd: string | null = null;

        if (providerDiscovered && providerDiscovered.length > 0) {
          modelToAdd = providerDiscovered[0].id;
        } else if (defaultModels[provider] && defaultModels[provider].length > 0) {
          modelToAdd = defaultModels[provider][0];
        }

        if (modelToAdd) {
          const result = addQuickSwitchModel(provider, modelToAdd);
          if (result.added || result.movedToTop) {
            addedCount++;
          }
        }
      }
    }

    if (addedCount > 0) {
      // Select the first model
      selectedQuickSwitchIndex.set(0);
      autoAddMessage = `Added ${addedCount} model${addedCount > 1 ? 's' : ''}`;
    } else {
      autoAddMessage = 'No API keys configured';
    }

    setTimeout(() => {
      autoAddMessage = null;
    }, 2000);
  }
</script>

<div class="model-quick-switch" bind:this={dropdownRef}>
  <div class="header-row">
    <span class="label">Model Quick List</span>
    <button
      type="button"
      class="auto-add-btn"
      onclick={handleAutoAdd}
      title="Auto-add models from all providers with API keys"
    >
      ⚡
    </button>
    {#if autoAddMessage}
      <span class="auto-add-message">{autoAddMessage}</span>
    {/if}
  </div>
  <div class="dropdown-row">
    <button
      type="button"
      class="dropdown-trigger"
      class:empty={isEmpty}
      class:open={isOpen}
      class:warning={isWarning}
      onclick={toggleDropdown}
      disabled={isEmpty}
      title={isEmpty ? 'No models added. Add models from LLM Configuration.' : 'Select a model'}
    >
      {#if selectedModel}
        <span class="selected-text">{formatQuickSwitchModel(selectedModel)}</span>
      {:else if isEmpty}
        <span class="placeholder">No models added</span>
      {:else}
        <span class="placeholder">Select a model</span>
      {/if}
      <span class="arrow">{isOpen ? '▲' : '▼'}</span>
    </button>

    {#if isOpen && !isEmpty}
      <div class="dropdown-menu">
        {#each models as model, index}
          <div
            class="dropdown-item"
            class:selected={index === selectedIndex}
            role="option"
            aria-selected={index === selectedIndex}
          >
            <button
              type="button"
              class="item-content"
              onclick={() => handleSelect(index)}
            >
              {formatQuickSwitchModel(model)}
            </button>
            <button
              type="button"
              class="remove-btn"
              onclick={(e) => handleRemove(e, index)}
              title="Remove from list"
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .model-quick-switch {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background-color: #1e1e1e;
    border-bottom: 1px solid #3e3e42;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 500;
    color: #9d9d9d;
    white-space: nowrap;
  }

  .dropdown-row {
    position: relative;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.375rem;
    background-color: #3c3c3c;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 0.7rem;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
  }

  .dropdown-trigger:hover:not(:disabled) {
    border-color: #007acc;
    background-color: #454545;
  }

  .dropdown-trigger:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }

  .dropdown-trigger.open {
    border-color: #007acc;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dropdown-trigger.empty {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .dropdown-trigger:disabled {
    cursor: not-allowed;
  }

  .dropdown-trigger.warning {
    border-color: #f48771;
    box-shadow: 0 0 0 2px rgba(244, 135, 113, 0.3);
    animation: pulse-warning 1s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%, 100% {
      box-shadow: 0 0 0 2px rgba(244, 135, 113, 0.3);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(244, 135, 113, 0.5);
    }
  }

  .selected-text {
    font-family: monospace;
    font-size: 0.65rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: #808080;
    font-style: italic;
    font-size: 0.65rem;
  }

  .arrow {
    font-size: 0.5rem;
    margin-left: 0.25rem;
    color: #808080;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: #3c3c3c;
    border: 1px solid #007acc;
    border-top: none;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    max-height: 150px;
    overflow-y: auto;
    z-index: 100;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #4a4a4a;
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item.selected {
    background-color: #094771;
  }

  .item-content {
    flex: 1;
    padding: 0.25rem 0.375rem;
    background: none;
    border: none;
    color: #d4d4d4;
    font-family: monospace;
    font-size: 0.65rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-content:hover {
    background-color: #454545;
  }

  .dropdown-item.selected .item-content:hover {
    background-color: #0a5a8a;
  }

  .remove-btn {
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    border-left: 1px solid #4a4a4a;
    color: #808080;
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;
  }

  .remove-btn:hover {
    color: #f48771;
    background-color: rgba(244, 135, 113, 0.15);
  }

  .auto-add-btn {
    padding: 0.125rem 0.375rem;
    background-color: #3c3c3c;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .auto-add-btn:hover {
    background-color: #454545;
    border-color: #007acc;
    color: #ffd700;
  }

  .auto-add-message {
    font-size: 0.6rem;
    color: #4ec9b0;
    white-space: nowrap;
  }
</style>
