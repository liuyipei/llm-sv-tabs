<script lang="ts">
  import {
    quickSwitchModels,
    selectedQuickSwitchIndex,
    removeQuickSwitchModel,
    formatQuickSwitchModel,
    formatQuickSwitchModelTruncated,
    addQuickSwitchModel,
    apiKeys,
    discoveredModels,
    type QuickSwitchModel
  } from '../../stores/config.js';
  import {
    modelCapabilities,
    isCapabilityStale as isCapabilityStaleCached,
  } from '../../stores/capabilities.js';
  import { showModelSelectionWarning } from '../../stores/ui.js';
  import { defaultModels, providersRequiringApiKey } from '../../config/model-defaults';

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
  const capabilitiesMap = $derived($modelCapabilities);
  const isEmpty = $derived(models.length === 0);

  function describeCapabilities(model: QuickSwitchModel): string {
    const entry = capabilitiesMap.get(`${model.provider}:${model.model}`);
    if (!entry) return 'Probing...';
    const caps = entry.capabilities;
    const parts = [];
    parts.push(caps.supportsVision ? 'vision' : 'text-only');
    if (caps.supportsPdfNative) {
      parts.push('pdf');
    } else if (caps.supportsPdfAsImages) {
      parts.push('pdf→images');
    }
    if (caps.requiresBase64Images) parts.push('base64');
    if (caps.requiresImagesFirst) parts.push('img-first');
    if (isCapabilityStaleCached(entry)) parts.push('stale');
    return parts.join(' · ') || 'unknown';
  }

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
        <span class="selected-text" title={formatQuickSwitchModel(selectedModel)}>{formatQuickSwitchModelTruncated(selectedModel, 40)}</span>
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
              title={`${formatQuickSwitchModel(model)}\n${describeCapabilities(model)}`}
            >
              <span class="model-label">{formatQuickSwitchModelTruncated(model, 40)}</span>
              <span class="capability-badges">{describeCapabilities(model)}</span>
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
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background-color: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .label {
    font-size: 0.7rem;
    font-weight: var(--font-medium);
    color: var(--text-secondary);
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
    padding: var(--space-2) var(--space-3);
    background-color: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.7rem;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
  }

  .dropdown-trigger:hover:not(:disabled) {
    border-color: var(--accent-color);
    background-color: var(--bg-hover);
  }

  .dropdown-trigger:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 2px var(--accent-bg);
  }

  .dropdown-trigger.open {
    border-color: var(--accent-color);
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
    border-color: var(--error-text);
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
    font-family: var(--font-mono);
    font-size: 0.6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: var(--text-tertiary);
    font-style: italic;
    font-size: 0.6rem;
  }

  .arrow {
    font-size: 0.5rem;
    margin-left: var(--space-2);
    color: var(--text-tertiary);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: var(--bg-input);
    border: 1px solid var(--accent-color);
    border-top: none;
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    max-height: 150px;
    overflow-y: auto;
    z-index: 100;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--bg-hover);
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item.selected {
    background-color: var(--bg-active);
  }

  .item-content {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }

  .item-content:hover {
    background-color: var(--bg-hover);
  }

  .dropdown-item.selected .item-content:hover {
    background-color: #0a5a8a;
  }

  .remove-btn {
    padding: var(--space-2) var(--space-4);
    background: none;
    border: none;
    border-left: 1px solid var(--bg-hover);
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .remove-btn:hover {
    color: var(--error-text);
    background-color: var(--warning-bg);
  }

  .auto-add-btn {
    padding: var(--space-1) var(--space-3);
    background-color: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .auto-add-btn:hover {
    background-color: var(--bg-hover);
    border-color: var(--accent-color);
    color: var(--semantic-yellow);
  }

  .auto-add-message {
    font-size: 0.6rem;
    color: var(--semantic-cyan);
    white-space: nowrap;
  }

  .capability-badges {
    font-size: 0.6rem;
    color: var(--text-secondary);
  }

  .model-label {
    font-weight: var(--font-semibold);
  }
</style>
