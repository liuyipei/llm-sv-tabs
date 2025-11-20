import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TabItem from '../../src/ui/components/tabs/TabItem.svelte';
import { activeTabId, selectedTabs } from '../../src/ui/stores/tabs.js';

/**
 * TabItem Component Tests
 *
 * Comprehensive tests for TabItem component including basic rendering,
 * interactions, and context menu functionality.
 */

// Mock IPC context
const mockIpc = {
  setActiveTab: vi.fn(),
  closeTab: vi.fn(),
  reloadTab: vi.fn().mockResolvedValue({ success: true }),
  copyTabUrl: vi.fn().mockResolvedValue({ success: true, url: 'https://example.com' }),
};

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
  configurable: true,
});

describe('TabItem', () => {
  const mockTab = {
    id: 'tab-1',
    title: 'Test Tab',
    url: 'https://example.com',
    type: 'webpage',
  };

  beforeEach(() => {
    activeTabId.set(null);
    selectedTabs.set(new Set());
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render tab with title and URL', () => {
      const { getByText } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      expect(getByText('Test Tab')).toBeTruthy();
      expect(getByText('https://example.com')).toBeTruthy();
    });

    it('should display "Untitled" when tab has no title', () => {
      const tabWithoutTitle = { ...mockTab, title: '' };

      const { getByText } = render(TabItem, {
        props: { tab: tabWithoutTitle },
        context: new Map([['ipc', mockIpc]]),
      });

      expect(getByText('Untitled')).toBeTruthy();
    });
  });

  describe('Active State', () => {
    it('should show active state when tab is active', () => {
      activeTabId.set('tab-1');

      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      expect(tabItem.classList.contains('active')).toBe(true);
    });

    it('should not show active state when tab is not active', () => {
      activeTabId.set('other-tab');

      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      expect(tabItem.classList.contains('active')).toBe(false);
    });
  });

  describe('Click Interactions', () => {
    it('should call setActiveTab when clicked', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.click(tabItem);

      expect(mockIpc.setActiveTab).toHaveBeenCalledWith('tab-1');
    });

    it('should call closeTab when close button is clicked', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const closeBtn = container.querySelector('.close-btn');
      await fireEvent.click(closeBtn);

      expect(mockIpc.closeTab).toHaveBeenCalledWith('tab-1');
    });

    it('should not call setActiveTab when close button is clicked', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const closeBtn = container.querySelector('.close-btn');
      await fireEvent.click(closeBtn);

      expect(mockIpc.setActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('Selection Checkbox', () => {
    it('should toggle selection when checkbox is clicked', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const checkbox = container.querySelector('input[type="checkbox"]');

      // Initially unchecked
      expect(checkbox.checked).toBe(false);

      // Click to select
      await fireEvent.click(checkbox);
      expect(get(selectedTabs).has('tab-1')).toBe(true);

      // Click to deselect
      await fireEvent.click(checkbox);
      expect(get(selectedTabs).has('tab-1')).toBe(false);
    });

    it('should not call setActiveTab when checkbox is clicked', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const checkbox = container.querySelector('input[type="checkbox"]');
      await fireEvent.click(checkbox);

      expect(mockIpc.setActiveTab).not.toHaveBeenCalled();
    });

    it('should show checkbox as checked when tab is selected', () => {
      selectedTabs.set(new Set(['tab-1']));

      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(true);
    });
  });

  describe('Context Menu', () => {
    it('should show context menu on right-click', async () => {
      const { container } = render(TabItem, {
        props: { tab: mockTab },
        context: new Map([['ipc', mockIpc]]),
      });

      const tabItem = container.querySelector('.tab-item');
      await fireEvent.contextMenu(tabItem);

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
  });

  describe('Context Menu Actions', () => {
    it('should reload tab when reload is clicked', async () => {
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

    it('should close tab when close is clicked from context menu', async () => {
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
  });
});
