import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TabManager Unit Tests
 *
 * Fast, forward-looking tests for the TabManager class focusing on brittle parts:
 * - Tab lifecycle management (create, close, switch)
 * - Error handling for non-existent tabs
 * - Tab data extraction and serialization
 * - Active tab state management
 *
 * Note: These tests mock Electron dependencies to stay fast (no actual WebContentsViews)
 */

// Mock Electron modules
class MockWebContentsView {
  constructor() {
    this.webContents = {
      loadURL: vi.fn(),
      reload: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(),
      downloadURL: vi.fn(),
      inspectElement: vi.fn(),
      isDevToolsOpened: vi.fn().mockReturnValue(false),
      openDevTools: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false), // Add isDestroyed check
    };
    this.setBounds = vi.fn();
    this.setAutoResize = vi.fn();
  }
}

vi.mock('electron', () => ({
  WebContentsView: MockWebContentsView,
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn((name) => {
      if (name === 'userData') {
        return '/tmp/test-user-data';
      }
      return '/tmp/test';
    }),
  },
}));

// Import after mocking
const { default: TabManager } = await import('../../src/main/tab-manager.ts');

describe('TabManager', () => {
  let tabManager;
  let mockWindow;

  beforeEach(() => {
    // Create mock BrowserWindow
    mockWindow = {
      contentView: {
        addChildView: vi.fn(),
        removeChildView: vi.fn(),
      },
      getBounds: vi.fn().mockReturnValue({ width: 1400, height: 900 }),
      getContentBounds: vi.fn().mockReturnValue({ width: 1400, height: 900 }),
      on: vi.fn(), // For event listeners
      webContents: {
        send: vi.fn(),
      },
    };

    tabManager = new TabManager(mockWindow);
  });

  describe('Tab Creation', () => {
    it('should create a tab with incremental ID', () => {
      const result1 = tabManager.openUrl('https://example1.com');
      const result2 = tabManager.openUrl('https://example2.com');

      expect(result1.tabId).toBe('tab-1');
      expect(result2.tabId).toBe('tab-2');
    });

    it('should create tab with correct initial state', () => {
      const url = 'https://example.com';
      const result = tabManager.openUrl(url);

      expect(result.tab).toMatchObject({
        id: 'tab-1',
        title: 'Loading...',
        url: url,
        type: 'webpage',
      });
    });

    it('should set new tab as active', () => {
      const result = tabManager.openUrl('https://example.com');
      const activeTabs = tabManager.getActiveTabs();

      expect(activeTabs.activeTabId).toBe(result.tabId);
    });

    it('should notify renderer about tab creation', () => {
      tabManager.openUrl('https://example.com');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'tab-created',
        expect.objectContaining({
          tab: expect.objectContaining({
            id: 'tab-1',
            url: 'https://example.com',
          }),
        })
      );
    });
  });

  describe('Tab Retrieval', () => {
    beforeEach(() => {
      tabManager.openUrl('https://example1.com');
      tabManager.openUrl('https://example2.com');
      tabManager.openUrl('https://example3.com');
    });

    it('should get all active tabs', () => {
      const result = tabManager.getActiveTabs();

      expect(result.tabs).toHaveLength(3);
      expect(result.tabs[0].id).toBe('tab-1');
      expect(result.tabs[1].id).toBe('tab-2');
      expect(result.tabs[2].id).toBe('tab-3');
    });

    it('should get specific tab data by ID', () => {
      const tab = tabManager.getTabData('tab-2');

      expect(tab).toMatchObject({
        id: 'tab-2',
        url: 'https://example2.com',
        type: 'webpage',
      });
    });

    it('should return null for non-existent tab', () => {
      const tab = tabManager.getTabData('non-existent');

      expect(tab).toBeNull();
    });

    it('should not expose WebContentsView in tab data', () => {
      const tab = tabManager.getTabData('tab-1');

      expect(tab).not.toHaveProperty('view');
    });
  });

  describe('Tab Closing', () => {
    beforeEach(() => {
      tabManager.openUrl('https://example1.com');
      tabManager.openUrl('https://example2.com');
      tabManager.openUrl('https://example3.com');
    });

    it('should close a tab successfully', () => {
      const result = tabManager.closeTab('tab-2');

      expect(result.success).toBe(true);
      expect(tabManager.getActiveTabs().tabs).toHaveLength(2);
    });

    it('should return error for non-existent tab', () => {
      const result = tabManager.closeTab('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab not found');
    });

    it('should notify renderer about tab closure', () => {
      tabManager.closeTab('tab-2');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'tab-closed',
        expect.objectContaining({ id: 'tab-2' })
      );
    });

    it('should switch active tab when closing active tab', () => {
      // tab-3 is active (last created)
      const activeBefore = tabManager.getActiveTabs().activeTabId;
      expect(activeBefore).toBe('tab-3');

      tabManager.closeTab('tab-3');

      const activeAfter = tabManager.getActiveTabs().activeTabId;
      expect(activeAfter).toBe('tab-1'); // Should switch to first remaining
    });

    it('should set activeTabId to null when closing last tab', () => {
      tabManager.closeTab('tab-1');
      tabManager.closeTab('tab-2');
      tabManager.closeTab('tab-3');

      const result = tabManager.getActiveTabs();
      expect(result.activeTabId).toBeNull();
      expect(result.tabs).toHaveLength(0);
    });
  });

  describe('Active Tab Management', () => {
    beforeEach(() => {
      tabManager.openUrl('https://example1.com');
      tabManager.openUrl('https://example2.com');
      tabManager.openUrl('https://example3.com');
    });

    it('should set active tab successfully', () => {
      const result = tabManager.setActiveTab('tab-1');

      expect(result.success).toBe(true);
      expect(tabManager.getActiveTabs().activeTabId).toBe('tab-1');
    });

    it('should return error when setting non-existent tab as active', () => {
      const result = tabManager.setActiveTab('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab not found');
    });

    it('should notify renderer about active tab change', () => {
      tabManager.setActiveTab('tab-1');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'active-tab-changed',
        expect.objectContaining({ id: 'tab-1' })
      );
    });

    it('should position active tab WebContentsView correctly', () => {
      tabManager.setActiveTab('tab-1');

      // Should call addChildView when switching
      expect(mockWindow.contentView.addChildView).toHaveBeenCalled();
    });
  });

  describe('Tab Reload', () => {
    beforeEach(() => {
      tabManager.openUrl('https://example.com');
    });

    it('should reload tab successfully', () => {
      const result = tabManager.reloadTab('tab-1');

      expect(result.success).toBe(true);
    });

    it('should return error when reloading non-existent tab', () => {
      const result = tabManager.reloadTab('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab not found');
    });
  });

  describe('Tab URL Copy', () => {
    beforeEach(() => {
      tabManager.openUrl('https://example.com');
    });

    it('should return tab URL successfully', () => {
      const result = tabManager.copyTabUrl('tab-1');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
    });

    it('should return error for non-existent tab', () => {
      const result = tabManager.copyTabUrl('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab not found');
    });
  });

  describe('Tab Selection', () => {
    it('should select multiple tabs', () => {
      tabManager.openUrl('https://example1.com');
      tabManager.openUrl('https://example2.com');

      const result = tabManager.selectTabs(['tab-1', 'tab-2']);

      expect(result.success).toBe(true);
      expect(result.selectedTabs).toEqual(['tab-1', 'tab-2']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle operations on empty tab list', () => {
      const tabs = tabManager.getActiveTabs();

      expect(tabs.tabs).toHaveLength(0);
      expect(tabs.activeTabId).toBeNull();
    });

    it('should handle closing tab that is not active', () => {
      tabManager.openUrl('https://example1.com');
      tabManager.openUrl('https://example2.com');
      tabManager.setActiveTab('tab-1');

      const result = tabManager.closeTab('tab-2');

      expect(result.success).toBe(true);
      expect(tabManager.getActiveTabs().activeTabId).toBe('tab-1');
    });

    it('should handle rapid tab creation', () => {
      const urls = Array.from({ length: 20 }, (_, i) => `https://example${i}.com`);

      urls.forEach((url) => tabManager.openUrl(url));

      const result = tabManager.getActiveTabs();
      expect(result.tabs).toHaveLength(20);
    });

    it('should maintain tab order', () => {
      tabManager.openUrl('https://a.com');
      tabManager.openUrl('https://b.com');
      tabManager.openUrl('https://c.com');

      const tabs = tabManager.getActiveTabs().tabs;

      expect(tabs[0].url).toBe('https://a.com');
      expect(tabs[1].url).toBe('https://b.com');
      expect(tabs[2].url).toBe('https://c.com');
    });
  });

  describe('Performance', () => {
    it('should handle many tabs efficiently', () => {
      const startTime = performance.now();

      // Create 100 tabs
      for (let i = 0; i < 100; i++) {
        tabManager.openUrl(`https://example${i}.com`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(tabManager.getActiveTabs().tabs).toHaveLength(100);

      // Should complete in under 200ms (fast test requirement)
      expect(duration).toBeLessThan(200);
    });
  });
});
