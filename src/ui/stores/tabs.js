import { writable, derived } from 'svelte/store';

// Core tab state
export const activeTabs = writable(new Map());
export const selectedTabs = writable(new Set());
export const activeTabId = writable(null);
export const sortMode = writable('time');
export const sortDirection = writable('desc');

// Derived store for sorted tabs
export const sortedTabs = derived(
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
      default:
        // Tabs are already in creation order
        break;
    }

    // Apply direction
    if ($sortDirection === 'desc') {
      sorted.reverse();
    }

    return sorted;
  }
);

// Derived store for tab count
export const tabCount = derived(activeTabs, ($activeTabs) => $activeTabs.size);

// Derived store for selected tab count
export const selectedTabCount = derived(
  selectedTabs,
  ($selectedTabs) => $selectedTabs.size
);

// Helper functions to update stores
export function addTab(tab) {
  activeTabs.update((tabs) => {
    tabs.set(tab.id, tab);
    return new Map(tabs); // Create new Map to trigger reactivity
  });
}

export function removeTab(tabId) {
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

export function updateTabTitle(tabId, title) {
  activeTabs.update((tabs) => {
    const tab = tabs.get(tabId);
    if (tab) {
      tab.title = title;
      return new Map(tabs);
    }
    return tabs;
  });
}

export function updateTabUrl(tabId, url) {
  activeTabs.update((tabs) => {
    const tab = tabs.get(tabId);
    if (tab) {
      tab.url = url;
      return new Map(tabs);
    }
    return tabs;
  });
}

export function toggleTabSelection(tabId) {
  selectedTabs.update((selected) => {
    if (selected.has(tabId)) {
      selected.delete(tabId);
    } else {
      selected.add(tabId);
    }
    return new Set(selected);
  });
}

export function clearSelection() {
  selectedTabs.set(new Set());
}
