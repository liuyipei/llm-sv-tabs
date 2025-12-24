<script lang="ts">
  import {
    formatShortcut,
    resolvePlatform,
    shortcutDefinitions,
    type ShortcutDefinition,
  } from '../../../shared/keyboard-shortcuts.js';

  const platform = resolvePlatform();
  const platformLabel = platform === 'mac' ? 'macOS' : 'Windows/Linux';

  const categoryOrder: ShortcutDefinition['category'][] = [
    'Focus',
    'Navigation',
    'Tab Management',
    'Search',
    'Actions',
  ];

  const groupedShortcuts = categoryOrder
    .map((category) => ({
      category,
      items: shortcutDefinitions.filter(
        (definition) =>
          definition.category === category && formatShortcut(definition, platform).length > 0
      ),
    }))
    .filter(({ items }) => items.length > 0);

  function formatChords(definition: ShortcutDefinition): string {
    return formatShortcut(definition, platform).join(' / ');
  }
</script>

<section class="shortcuts-panel">
  <header class="panel-header">
    <div>
      <p class="eyebrow">Keyboard shortcuts</p>
      <h2>Stay fast on {platformLabel}</h2>
      <p class="description">
        Generated from the shared shortcut registry, so the UI, docs, and runtime all stay in sync.
      </p>
    </div>
    <div class="platform-chip">{platformLabel}</div>
  </header>

  {#each groupedShortcuts as group}
    <div class="category">
      <div class="category-header">
        <h3>{group.category}</h3>
      </div>
      <div class="category-table">
        <div class="table-head">
          <span>Action</span>
          <span>Shortcut</span>
        </div>
        {#each group.items as shortcut}
          <div class="table-row">
            <div class="action">
              <div class="title">{shortcut.description}</div>
            </div>
            <div class="shortcut">{formatChords(shortcut)}</div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</section>

<style>
  .shortcuts-panel {
    padding: var(--space-5);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  }

  .eyebrow {
    text-transform: uppercase;
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    color: var(--text-disabled);
    margin: 0 0 var(--space-2) 0;
  }

  h2 {
    margin: 0;
    font-size: var(--text-2xl);
  }

  .description {
    margin: var(--space-2) 0 0 0;
    color: var(--text-secondary);
  }

  .platform-chip {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 999px;
    padding: var(--space-3) var(--space-4);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .category {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .category-header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .category-header h3 {
    margin: 0;
    font-size: var(--text-lg);
  }

  .category-table {
    display: flex;
    flex-direction: column;
  }

  .table-head,
  .table-row {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
  }

  .table-head {
    color: var(--text-secondary);
    font-size: var(--text-sm);
    border-bottom: 1px solid var(--border-color);
  }

  .table-row:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }

  .title {
    font-weight: 600;
  }

  .shortcut {
    font-family: var(--font-mono);
    text-align: right;
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .table-head,
    .table-row {
      grid-template-columns: 1fr;
      text-align: left;
    }

    .shortcut {
      text-align: left;
    }
  }
</style>
