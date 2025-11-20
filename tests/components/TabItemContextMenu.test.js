import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TabItem from '../../src/ui/components/tabs/TabItem.svelte';
import { activeTabId, selectedTabs } from '../../src/ui/stores/tabs.js';

/**
 * Phase 2 Context Menu Tests
 *
 * Fast, future-looking tests for the tab context menu functionality.
 * Tests cover right-click context menu actions: reload, copy URL, and close.
 */

// Mock IPC API
const mockIpc = {
  setActiveTab: vi.fn(),
  closeTab: vi.fn(),
  reloadTab: vi.fn().mockResolvedValue({ success: true }),
  copyTabUrl: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
};

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe('Phase 2: Tab Context Menu', () => {
  const mockTab = {
    id: 'tab-1',
    title: 'Example Domain',
    url: 'https://example.com',
    type: 'webpage',
  };

  beforeEach(() => {
    activeTabId.set(null);
    selectedTabs.set(new Set());
    vi.clearAllMocks();
  });

  describe('Context Menu Display', () => {
    it('should show context menu on right-click', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');

      // Right-click to open context menu
      await fireEvent.contextMenu(tabItem);

      // Context menu should appear
      const contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeTruthy();
    });

    it('should have reload, copy URL, and close options', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      expect(getByText('Reload Tab')).toBeTruthy();
      expect(getByText('Copy URL')).toBeTruthy();
      expect(getByText('Close Tab')).toBeTruthy();
    });

    it('should close context menu when clicking outside', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      let contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeTruthy();

      // Simulate click outside
      await fireEvent.click(document.body);

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Context menu should be gone
      contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeFalsy();
    });
  });

  describe('Reload Tab Action', () => {
    it('should call reloadTab when reload is clicked', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const reloadBtn = getByText('Reload Tab');
      await fireEvent.click(reloadBtn);

      expect(mockIpc.reloadTab).toHaveBeenCalledWith('tab-1');
    });

    it('should close context menu after reload', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const reloadBtn = getByText('Reload Tab');
      await fireEvent.click(reloadBtn);

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeFalsy();
    });
  });

  describe('Copy URL Action', () => {
    it('should copy URL to clipboard when copy is clicked', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const copyBtn = getByText('Copy URL');
      await fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com');
    });

    it('should close context menu after copying URL', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const copyBtn = getByText('Copy URL');
      await fireEvent.click(copyBtn);

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeFalsy();
    });

    it('should handle clipboard error gracefully', async () => {
      // Mock clipboard error
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));

      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const copyBtn = getByText('Copy URL');
      await fireEvent.click(copyBtn);

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Close Tab Action', () => {
    it('should call closeTab when close is clicked from context menu', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const closeBtn = getByText('Close Tab');
      await fireEvent.click(closeBtn);

      expect(mockIpc.closeTab).toHaveBeenCalledWith('tab-1');
    });

    it('should not call setActiveTab when closing from context menu', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

      const closeBtn = getByText('Close Tab');
      await fireEvent.click(closeBtn);

      expect(mockIpc.setActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('Context Menu Integration', () => {
    it('should not open context menu when clicking normally', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.click(tabItem);

      const contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeFalsy();
    });

    it('should handle multiple context menu operations in sequence', async () => {
      const { container, getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');

      // First operation: Reload
      await fireEvent.contextMenu(tabItem);
      await fireEvent.click(getByText('Reload Tab'));
      expect(mockIpc.reloadTab).toHaveBeenCalledTimes(1);

      // Wait for menu to close
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second operation: Copy URL
      await fireEvent.contextMenu(tabItem);
      await fireEvent.click(getByText('Copy URL'));
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

      // Third operation: Close tab
      await new Promise((resolve) => setTimeout(resolve, 10));
      await fireEvent.contextMenu(tabItem);
      await fireEvent.click(getByText('Close Tab'));
      expect(mockIpc.closeTab).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance', () => {
    it('should open context menu quickly', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');

      const startTime = performance.now();
      await fireEvent.contextMenu(tabItem);
      const endTime = performance.now();

      const contextMenu = container.querySelector('.context-menu');
      expect(contextMenu).toBeTruthy();

      // Should open in under 10ms (fast test requirement)
      expect(endTime - startTime).toBeLessThan(10);
    });
  });
});
