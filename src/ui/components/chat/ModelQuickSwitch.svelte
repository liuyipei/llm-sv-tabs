<script lang="ts">
  import {
    quickSwitchModels,
    selectedQuickSwitchIndex,
    removeQuickSwitchModel,
    formatQuickSwitchModel,
    type QuickSwitchModel
  } from '../../stores/config.js';
  import { showModelSelectionWarning } from '../../stores/ui.js';

  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement;
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
</script>

<div class="model-quick-switch" bind:this={dropdownRef}>
  <label class="label">Model:</label>
  <div class="dropdown-container">
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
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background-color: #1e1e1e;
    border-bottom: 1px solid #3e3e42;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #9d9d9d;
    white-space: nowrap;
  }

  .dropdown-container {
    position: relative;
    flex: 1;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    background-color: #3c3c3c;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #d4d4d4;
    font-size: 0.875rem;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: #808080;
    font-style: italic;
  }

  .arrow {
    font-size: 0.625rem;
    margin-left: 0.5rem;
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
    max-height: 200px;
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
    padding: 0.5rem;
    background: none;
    border: none;
    color: #d4d4d4;
    font-family: monospace;
    font-size: 0.875rem;
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
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    border-left: 1px solid #4a4a4a;
    color: #808080;
    font-size: 1rem;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;
  }

  .remove-btn:hover {
    color: #f48771;
    background-color: rgba(244, 135, 113, 0.15);
  }
</style>
