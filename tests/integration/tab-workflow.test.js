import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  activeTabs,
  selectedTabs,
  activeTabId,
  addTab,
  removeTab,
  toggleTabSelection,
  clearSelection,
} from '../../src/ui/stores/tabs.js';

/**
 * Phase 2 Tab Workflow Tests
 *
 * These are fast, future-looking tests that validate the core tab functionality
 * implemented in Phase 2 of the migration from llm-dom-browser to llm-sv-tabs.
 *
 * Tests cover:
 * - Tab creation workflow
 * - Tab switching and activation
 * - Tab selection for LLM context
 * - Tab closing workflow
 */

describe('Phase 2: Tab Workflow', () => {
  beforeEach(() => {
    // Reset all stores to clean state
    activeTabs.set(new Map());
    selectedTabs.set(new Set());
    activeTabId.set(null);
  });

  describe('Tab Creation Workflow', () => {
    it('should create a tab and add it to active tabs', () => {
      const tab = {
        id: 'tab-1',
        title: 'Example Domain',
        url: 'https://example.com',
        type: 'webpage',
        created: Date.now(),
        lastViewed: Date.now(),
      };

      addTab(tab);

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(1);
      expect(tabs.get('tab-1')).toEqual(tab);
    });

    it('should create multiple tabs in sequence', () => {
      const tabs = [
        { id: 'tab-1', title: 'Tab 1', url: 'https://example1.com', type: 'webpage' },
        { id: 'tab-2', title: 'Tab 2', url: 'https://example2.com', type: 'webpage' },
        { id: 'tab-3', title: 'Tab 3', url: 'https://example3.com', type: 'webpage' },
      ];

      tabs.forEach(addTab);

      const activeTabs_ = get(activeTabs);
      expect(activeTabs_.size).toBe(3);
      expect(Array.from(activeTabs_.keys())).toEqual(['tab-1', 'tab-2', 'tab-3']);
    });
  });

  describe('Tab Switching and Activation', () => {
    beforeEach(() => {
      addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });
      addTab({ id: 'tab-3', title: 'Tab 3', url: 'https://3.com', type: 'webpage' });
    });

    it('should switch between tabs', () => {
      activeTabId.set('tab-1');
      expect(get(activeTabId)).toBe('tab-1');

      activeTabId.set('tab-2');
      expect(get(activeTabId)).toBe('tab-2');

      activeTabId.set('tab-3');
      expect(get(activeTabId)).toBe('tab-3');
    });

    it('should handle switching to non-existent tab gracefully', () => {
      activeTabId.set('non-existent-tab');
      expect(get(activeTabId)).toBe('non-existent-tab');
      // Note: The actual validation happens in TabManager, not in the store
    });
  });

  describe('Tab Selection for LLM Context', () => {
    beforeEach(() => {
      addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });
      addTab({ id: 'tab-3', title: 'Tab 3', url: 'https://3.com', type: 'webpage' });
    });

    it('should select a single tab', () => {
      toggleTabSelection('tab-1');

      const selected = get(selectedTabs);
      expect(selected.size).toBe(1);
      expect(selected.has('tab-1')).toBe(true);
    });

    it('should select multiple tabs for LLM context', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');
      toggleTabSelection('tab-3');

      const selected = get(selectedTabs);
      expect(selected.size).toBe(3);
      expect(selected.has('tab-1')).toBe(true);
      expect(selected.has('tab-2')).toBe(true);
      expect(selected.has('tab-3')).toBe(true);
    });

    it('should deselect a tab when toggled again', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');

      // Deselect tab-1
      toggleTabSelection('tab-1');

      const selected = get(selectedTabs);
      expect(selected.size).toBe(1);
      expect(selected.has('tab-1')).toBe(false);
      expect(selected.has('tab-2')).toBe(true);
    });

    it('should clear all selections', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');
      toggleTabSelection('tab-3');

      clearSelection();

      const selected = get(selectedTabs);
      expect(selected.size).toBe(0);
    });

    it('should maintain selection state when tabs are added', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');

      addTab({ id: 'tab-4', title: 'Tab 4', url: 'https://4.com', type: 'webpage' });

      const selected = get(selectedTabs);
      expect(selected.size).toBe(2);
      expect(selected.has('tab-1')).toBe(true);
      expect(selected.has('tab-2')).toBe(true);
      expect(selected.has('tab-4')).toBe(false);
    });
  });

  describe('Tab Closing Workflow', () => {
    beforeEach(() => {
      addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });
      addTab({ id: 'tab-3', title: 'Tab 3', url: 'https://3.com', type: 'webpage' });
    });

    it('should close a tab', () => {
      removeTab('tab-2');

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(2);
      expect(tabs.has('tab-2')).toBe(false);
      expect(tabs.has('tab-1')).toBe(true);
      expect(tabs.has('tab-3')).toBe(true);
    });

    it('should remove tab from selection when closed', () => {
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-2');
      toggleTabSelection('tab-3');

      removeTab('tab-2');

      const selected = get(selectedTabs);
      expect(selected.size).toBe(2);
      expect(selected.has('tab-2')).toBe(false);
      expect(selected.has('tab-1')).toBe(true);
      expect(selected.has('tab-3')).toBe(true);
    });

    it('should handle closing all tabs', () => {
      removeTab('tab-1');
      removeTab('tab-2');
      removeTab('tab-3');

      const tabs = get(activeTabs);
      const selected = get(selectedTabs);

      expect(tabs.size).toBe(0);
      expect(selected.size).toBe(0);
    });
  });

  describe('Complete Tab Lifecycle', () => {
    it('should handle complete tab workflow: create -> select -> switch -> close', () => {
      // Create tabs
      addTab({ id: 'tab-1', title: 'GitHub', url: 'https://github.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Google', url: 'https://google.com', type: 'webpage' });
      addTab({ id: 'tab-3', title: 'MDN', url: 'https://developer.mozilla.org', type: 'webpage' });

      expect(get(activeTabs).size).toBe(3);

      // Select tabs for LLM context
      toggleTabSelection('tab-1');
      toggleTabSelection('tab-3');

      expect(get(selectedTabs).size).toBe(2);

      // Switch active tab
      activeTabId.set('tab-2');
      expect(get(activeTabId)).toBe('tab-2');

      // Close a tab
      removeTab('tab-1');

      const tabs = get(activeTabs);
      const selected = get(selectedTabs);

      expect(tabs.size).toBe(2);
      expect(selected.size).toBe(1);
      expect(selected.has('tab-1')).toBe(false);
      expect(selected.has('tab-3')).toBe(true);
    });

    it('should handle edge case: close active tab', () => {
      addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
      addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });

      activeTabId.set('tab-1');
      expect(get(activeTabId)).toBe('tab-1');

      removeTab('tab-1');

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(1);
      expect(tabs.has('tab-1')).toBe(false);
      // Note: TabManager handles switching to another tab; this just tests store behavior
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle creating many tabs efficiently', () => {
      const startTime = performance.now();

      // Create 100 tabs
      for (let i = 0; i < 100; i++) {
        addTab({
          id: `tab-${i}`,
          title: `Tab ${i}`,
          url: `https://example${i}.com`,
          type: 'webpage',
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(100);

      // Should complete in under 100ms (fast test requirement)
      expect(duration).toBeLessThan(100);
    });

    it('should handle selecting many tabs efficiently', () => {
      // Create 50 tabs
      for (let i = 0; i < 50; i++) {
        addTab({
          id: `tab-${i}`,
          title: `Tab ${i}`,
          url: `https://example${i}.com`,
          type: 'webpage',
        });
      }

      const startTime = performance.now();

      // Select all tabs
      for (let i = 0; i < 50; i++) {
        toggleTabSelection(`tab-${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      const selected = get(selectedTabs);
      expect(selected.size).toBe(50);

      // Should complete in under 50ms (fast test requirement)
      expect(duration).toBeLessThan(50);
    });
  });
});
