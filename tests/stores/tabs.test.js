import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  activeTabs,
  selectedTabs,
  activeTabId,
  sortMode,
  sortDirection,
  sortedTabs,
  tabCount,
  selectedTabCount,
  addTab,
  removeTab,
  updateTabTitle,
  updateTabUrl,
  updateTab,
  toggleTabSelection,
  clearSelection,
} from '../../src/ui/stores/tabs.js';

describe('tabs store', () => {
  beforeEach(() => {
    // Reset stores before each test
    activeTabs.set(new Map());
    selectedTabs.set(new Set());
    activeTabId.set(null);
    sortMode.set('time');
    sortDirection.set('desc');
  });

  describe('basic tab operations', () => {
    it('should add a tab', () => {
      const tab = { id: 'tab-1', title: 'Test Tab', url: 'https://test.com', type: 'webpage' };
      addTab(tab);

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(1);
      expect(tabs.get('tab-1')).toEqual(tab);
    });

    it('should remove a tab', () => {
      const tab = { id: 'tab-1', title: 'Test Tab', url: 'https://test.com', type: 'webpage' };
      addTab(tab);
      removeTab('tab-1');

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(0);
    });

    it('should update tab title', () => {
      const tab = { id: 'tab-1', title: 'Old Title', url: 'https://test.com', type: 'webpage' };
      addTab(tab);
      updateTabTitle('tab-1', 'New Title');

      const tabs = get(activeTabs);
      expect(tabs.get('tab-1').title).toBe('New Title');
    });

    it('should update tab url', () => {
      const tab = { id: 'tab-1', title: 'Test', url: 'https://old.com', type: 'webpage' };
      addTab(tab);
      updateTabUrl('tab-1', 'https://new.com');

      const tabs = get(activeTabs);
      expect(tabs.get('tab-1').url).toBe('https://new.com');
    });
  });

  describe('tab selection', () => {
    beforeEach(() => {
      addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });
    });

    it('should toggle tab selection', () => {
      toggleTabSelection('tab-1');
      let selected = get(selectedTabs);
      expect(selected.has('tab-1')).toBe(true);

      toggleTabSelection('tab-1');
      selected = get(selectedTabs);
      expect(selected.has('tab-1')).toBe(false);
    });

    it('should clear all selections', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');

      clearSelection();
      const selected = get(selectedTabs);
      expect(selected.size).toBe(0);
    });

    it('should remove tab from selection when tab is removed', () => {
      toggleTabSelection('tab-1');
      removeTab('tab-1');

      const selected = get(selectedTabs);
      expect(selected.has('tab-1')).toBe(false);
    });
  });

  describe('derived stores', () => {
    beforeEach(() => {
      addTab({ id: 'tab-1', title: 'Apple', url: 'https://a.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Banana', url: 'https://b.com', type: 'webpage' });
      addTab({ id: 'tab-3', title: 'Cherry', url: 'https://c.com', type: 'webpage' });
    });

    it('should count tabs correctly', () => {
      expect(get(tabCount)).toBe(3);
      removeTab('tab-1');
      expect(get(tabCount)).toBe(2);
    });

    it('should count selected tabs correctly', () => {
      expect(get(selectedTabCount)).toBe(0);
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');
      expect(get(selectedTabCount)).toBe(2);
    });

    it('should sort tabs by title', () => {
      sortMode.set('title');
      sortDirection.set('asc');

      const sorted = get(sortedTabs);
      expect(sorted[0].title).toBe('Apple');
      expect(sorted[1].title).toBe('Banana');
      expect(sorted[2].title).toBe('Cherry');
    });

    it('should sort tabs by url', () => {
      sortMode.set('url');
      sortDirection.set('asc');

      const sorted = get(sortedTabs);
      expect(sorted[0].url).toBe('https://a.com');
      expect(sorted[1].url).toBe('https://b.com');
      expect(sorted[2].url).toBe('https://c.com');
    });

    it('should reverse sort direction', () => {
      sortMode.set('title');
      sortDirection.set('desc');

      const sorted = get(sortedTabs);
      expect(sorted[0].title).toBe('Cherry');
      expect(sorted[1].title).toBe('Banana');
      expect(sorted[2].title).toBe('Apple');
    });

    it('should handle time sorting (default)', () => {
      sortMode.set('time');
      sortDirection.set('asc');

      const sorted = get(sortedTabs);
      expect(sorted.length).toBe(3);
    });
  });

  describe('reactivity', () => {
    it('should trigger reactivity when adding tab', () => {
      let callCount = 0;
      const unsubscribe = activeTabs.subscribe(() => callCount++);

      addTab({ id: 'tab-1', title: 'Test', url: 'https://test.com', type: 'webpage' });
      expect(callCount).toBeGreaterThan(1); // Initial + update

      unsubscribe();
    });

    it('should update sortedTabs when sortMode changes', () => {
      addTab({ id: 'tab-1', title: 'Zebra', url: 'https://z.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Apple', url: 'https://a.com', type: 'webpage' });

      sortMode.set('title');
      sortDirection.set('asc');

      let sorted = get(sortedTabs);
      expect(sorted[0].title).toBe('Apple');

      sortDirection.set('desc');
      sorted = get(sortedTabs);
      expect(sorted[0].title).toBe('Zebra');
    });
  });

  describe('persistence and streaming guards', () => {
    it('should restore persisted tabs after a reset', () => {
      const tab1 = {
        id: 'tab-1',
        title: 'Persisted One',
        url: 'https://one.test',
        type: 'webpage',
        metadata: { response: 'first response', created: 100 },
      };

      const tab2 = {
        id: 'tab-2',
        title: 'Persisted Two',
        url: 'https://two.test',
        type: 'webpage',
        metadata: { response: 'second response', created: 200 },
      };

      addTab(tab1);
      addTab(tab2);

      const snapshot = new Map(get(activeTabs));

      // Simulate an app restart/reset and rehydrate from persisted state
      activeTabs.set(new Map());
      activeTabId.set(null);
      selectedTabs.set(new Set());

      activeTabs.set(new Map(snapshot));

      const restoredTabs = get(sortedTabs);
      expect(restoredTabs).toHaveLength(2);
      expect(restoredTabs.find((tab) => tab.id === 'tab-1')?.metadata?.response).toBe('first response');
      expect(restoredTabs.find((tab) => tab.id === 'tab-2')?.metadata?.response).toBe('second response');
    });

    it('should block returning to streaming once completed', () => {
      const tab = {
        id: 'tab-1',
        title: 'Streaming Tab',
        url: 'https://example.test',
        type: 'notes',
        metadata: { isStreaming: true, response: 'partial' },
      };

      addTab(tab);

      // Mark the stream as finished
      updateTab('tab-1', { metadata: { isStreaming: false, response: 'complete' } });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Attempt to revert to streaming; guard should keep it false
      updateTab('tab-1', { metadata: { isStreaming: true } });

      const updatedTab = get(activeTabs).get('tab-1');
      expect(updatedTab?.metadata?.isStreaming).toBe(false);
      expect(updatedTab?.metadata?.response).toBe('complete');
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
