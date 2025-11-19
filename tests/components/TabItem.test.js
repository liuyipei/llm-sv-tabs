import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TabItem from '../../src/ui/components/tabs/TabItem.svelte';
import { activeTabId, selectedTabs } from '../../src/ui/stores/tabs.js';

// Mock IPC context
const mockIpc = {
  setActiveTab: vi.fn(),
  closeTab: vi.fn(),
};

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

  it('should render tab with title and URL', () => {
    const { getByText } = render(TabItem, {
      props: { tab: mockTab },
      context: new Map([['ipc', mockIpc]]),
    });

    expect(getByText('Test Tab')).toBeTruthy();
    expect(getByText('https://example.com')).toBeTruthy();
  });

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

  it('should display "Untitled" when tab has no title', () => {
    const tabWithoutTitle = { ...mockTab, title: '' };

    const { getByText } = render(TabItem, {
      props: { tab: tabWithoutTitle },
      context: new Map([['ipc', mockIpc]]),
    });

    expect(getByText('Untitled')).toBeTruthy();
  });
});
