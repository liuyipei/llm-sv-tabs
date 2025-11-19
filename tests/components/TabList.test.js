import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import TabList from '../../src/ui/components/tabs/TabList.svelte';
import { activeTabs, addTab } from '../../src/ui/stores/tabs.js';

describe('TabList', () => {
  beforeEach(() => {
    activeTabs.set(new Map());
  });

  it('should show empty state when no tabs are open', () => {
    const { getByText } = render(TabList);

    expect(getByText('No tabs open')).toBeTruthy();
    expect(getByText('Enter a URL to open a new tab')).toBeTruthy();
  });

  it('should render tabs when they exist', () => {
    addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
    addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });

    const { getByText } = render(TabList);

    expect(getByText('Tab 1')).toBeTruthy();
    expect(getByText('Tab 2')).toBeTruthy();
  });

  it('should not show empty state when tabs exist', () => {
    addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });

    const { queryByText } = render(TabList);

    expect(queryByText('No tabs open')).toBeFalsy();
  });

  it('should render correct number of tabs', () => {
    addTab({ id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' });
    addTab({ id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' });
    addTab({ id: 'tab-3', title: 'Tab 3', url: 'https://3.com', type: 'webpage' });

    const { container } = render(TabList);

    // Count tab items (using data attributes or class names)
    const tabItems = container.querySelectorAll('.tab-item');
    expect(tabItems.length).toBe(3);
  });
});
