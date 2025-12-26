<script lang="ts">
  import type { RenderMode } from '../../../rendering';

  let { mode, onToggle }: {
    mode: RenderMode;
    onToggle: () => void;
  } = $props();

  const isMarkdown = $derived(mode === 'markdown');
  const tooltipText = $derived(isMarkdown ? 'Switch to raw text view' : 'Switch to markdown view');
</script>

<div class="render-mode-toggle" role="group" aria-label="Render mode toggle">
  <button
    class="toggle-btn"
    class:active={isMarkdown}
    onclick={isMarkdown ? undefined : onToggle}
    title="Markdown view"
    aria-pressed={isMarkdown}
    aria-label="Markdown view"
    disabled={isMarkdown}
  >
    <span class="toggle-icon">MD</span>
  </button>
  <button
    class="toggle-btn"
    class:active={!isMarkdown}
    onclick={!isMarkdown ? undefined : onToggle}
    title="Raw text view"
    aria-pressed={!isMarkdown}
    aria-label="Raw text view"
    disabled={!isMarkdown}
  >
    <span class="toggle-icon">Raw</span>
  </button>
  <span class="toggle-tooltip" aria-hidden="true">{tooltipText}</span>
</div>

<style>
  .render-mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0;
    position: relative;
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: 2px;
    font-size: var(--text-xs);
  }

  .toggle-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
    border-radius: var(--radius-default);
    transition: all var(--transition-fast);
    min-width: 36px;
    text-align: center;
  }

  .toggle-btn:hover:not(:disabled) {
    color: var(--text-primary);
    background-color: var(--bg-hover-subtle);
  }

  .toggle-btn:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: 1px;
  }

  .toggle-btn.active {
    background-color: var(--accent-color);
    color: var(--bg-primary);
    cursor: default;
  }

  .toggle-btn:disabled {
    cursor: default;
  }

  .toggle-icon {
    display: block;
    line-height: 1;
  }

  .toggle-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--bg-primary);
    color: var(--text-primary);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-default);
    font-size: var(--text-xs);
    white-space: nowrap;
    box-shadow: var(--shadow-sm);
    z-index: 10;
  }

  .render-mode-toggle:hover .toggle-tooltip {
    display: block;
  }
</style>
