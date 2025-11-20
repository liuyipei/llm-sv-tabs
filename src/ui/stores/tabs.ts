import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type { Tab, SortMode, SortDirection } from '../../types';

// Core tab state
export const activeTabs: Writable<Map<string, Tab>> = writable(new Map());
export const selectedTabs: Writable<Set<string>> = writable(new Set());
export const activeTabId: Writable<string | null> = writable(null);
export const sortMode: Writable<SortMode> = writable('time');
export const sortDirection: Writable<SortDirection> = writable('desc');

// Derived store for sorted tabs
export const sortedTabs: Readable<Tab[]> = derived(
  [activeTabs, sortMode, sortDirection],
  ([$activeTabs, $sortMode, $sortDirection]) => {
    const tabsArray = Array.from($activeTabs.values());

    // Sort based on mode
    let sorted = [...tabsArray];
    switch ($sortMode) {
      case 'url':
        sorted.sort((a, b) => a.url.localeCompare(b.url));
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'time':
        // Sort by lastViewed timestamp
        sorted.sort((a, b) => {
          const aTime = a.lastViewed || a.created || 0;
          const bTime = b.lastViewed || b.created || 0;
          return bTime - aTime; // Most recent first
        });
        break;
      case 'manual':
      default:
        // Keep original order
        break;
    }

    // Apply direction
    if ($sortDirection === 'desc' && $sortMode !== 'time') {
      sorted.reverse();
    } else if ($sortDirection === 'asc' && $sortMode === 'time') {
      sorted.reverse();
    }

    return sorted;
  }
);

// Derived store for tab count
export const tabCount: Readable<number> = derived(activeTabs, ($activeTabs) => $activeTabs.size);

// Derived store for selected tab count
export const selectedTabCount: Readable<number> = derived(
  selectedTabs,
  ($selectedTabs) => $selectedTabs.size
);

// Helper functions to update stores
export function addTab(tab: Tab): void {
  activeTabs.update((tabs) => {
    tabs.set(tab.id, tab);
    return new Map(tabs); // Create new Map to trigger reactivity
  });
}

export function removeTab(tabId: string): void {
  activeTabs.update((tabs) => {
    tabs.delete(tabId);
    return new Map(tabs);
  });

  // Also remove from selected tabs
  selectedTabs.update((selected) => {
    selected.delete(tabId);
    return new Set(selected);
  });
}

export function updateTab(tabId: string, updates: Partial<Tab>): void {
  activeTabs.update((tabs) => {
    const tab = tabs.get(tabId);
    if (tab) {
      Object.assign(tab, updates);
      return new Map(tabs);
    }
    return tabs;
  });
}

export function updateTabTitle(tabId: string, title: string): void {
  updateTab(tabId, { title });
}

export function updateTabUrl(tabId: string, url: string): void {
  updateTab(tabId, { url });
}

export function toggleTabSelection(tabId: string): void {
  selectedTabs.update((selected) => {
    if (selected.has(tabId)) {
      selected.delete(tabId);
    } else {
      selected.add(tabId);
    }
    return new Set(selected);
  });
}

export function clearSelection(): void {
  selectedTabs.set(new Set());
}
