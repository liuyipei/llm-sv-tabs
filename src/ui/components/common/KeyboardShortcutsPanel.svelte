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

  const fontSizeClass = 'compact-font';
</script>

<section class="shortcuts-panel {fontSizeClass}">
  <header class="panel-header">
    <h2>{platformLabel} shortcuts</h2>
    <p class="description">
      Live from the shared registry. Scroll to see everything.
    </p>
  </header>

  <div class="shortcuts-list" role="list">
    {#each groupedShortcuts as group}
      <div class="category">
        <div class="category-title">{group.category}</div>
        {#each group.items as shortcut}
          <div class="shortcut-row" role="listitem">
            <div class="action-title">{shortcut.description}</div>
            <div class="chords">
              {#each formatShortcut(shortcut, platform) as chord}
                <span class="chord-pill">{chord}</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</section>

<style>
  .shortcuts-panel {
    padding: var(--space-4);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    height: 100%;
  }

  .panel-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .description {
    margin: 0;
    color: var(--text-secondary);
  }

  .category {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border-color);
  }

  .category-title {
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .shortcuts-list {
    overflow-y: auto;
    padding-right: var(--space-2);
    flex: 1;
  }

  .shortcut-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1) 0;
  }

  .action-title {
    font-weight: 600;
  }

  .chords {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-family: var(--font-mono);
  }

  .chord-pill {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0.1rem 0.4rem;
  }

  .compact-font {
    font-size: var(--text-sm);
    line-height: 1.4;
  }
</style>
