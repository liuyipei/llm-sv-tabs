import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { initializeIPC } from '../../src/ui/lib/ipc-bridge.js';
import { activeTabs, activeTabId } from '../../src/ui/stores/tabs.js';

describe('IPC Bridge', () => {
  beforeEach(() => {
    activeTabs.set(new Map());
    activeTabId.set(null);
    delete window.electronAPI;
  });

  describe('Mock API (browser mode)', () => {
    it('should create mock API when electronAPI is not available', () => {
      const api = initializeIPC();

      expect(api).toBeDefined();
      expect(api.openUrl).toBeDefined();
      expect(api.closeTab).toBeDefined();
      expect(api.setActiveTab).toBeDefined();
    });

    it('should add tab when openUrl is called in mock mode', async () => {
      const api = initializeIPC();

      await api.openUrl('https://example.com');

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(1);

      const tab = Array.from(tabs.values())[0];
      expect(tab.url).toBe('https://example.com');
      expect(tab.title).toBe('https://example.com');
    });

    it('should remove tab when closeTab is called in mock mode', async () => {
      const api = initializeIPC();

      const result = await api.openUrl('https://example.com');
      const tabId = result.tabId;

      await api.closeTab(tabId);

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(0);
    });

    it('should set active tab in mock mode', async () => {
      const api = initializeIPC();

      const result = await api.openUrl('https://example.com');
      const tabId = result.tabId;

      await api.setActiveTab(tabId);

      expect(get(activeTabId)).toBe(tabId);
    });
  });

  describe('Electron API integration', () => {
    let mockElectronAPI;

    beforeEach(() => {
      mockElectronAPI = {
        openUrl: vi.fn().mockResolvedValue({ tabId: 'tab-1', tab: {} }),
        closeTab: vi.fn().mockResolvedValue({ success: true }),
        setActiveTab: vi.fn().mockResolvedValue({ success: true }),
        selectTabs: vi.fn().mockResolvedValue({ success: true }),
        getBookmarks: vi.fn().mockResolvedValue([]),
        addBookmark: vi.fn().mockResolvedValue({ success: true }),
        sendQuery: vi.fn().mockResolvedValue({ response: 'test response' }),
        getActiveTabs: vi.fn().mockResolvedValue({ tabs: [], activeTabId: null }),
        onTabCreated: vi.fn(),
        onTabClosed: vi.fn(),
        onTabTitleUpdated: vi.fn(),
        onTabUrlUpdated: vi.fn(),
        onActiveTabChanged: vi.fn(),
      };

      window.electronAPI = mockElectronAPI;
    });

    it('should use electron API when available', () => {
      const api = initializeIPC();

      expect(api.openUrl).toBeDefined();
      expect(mockElectronAPI.onTabCreated).toHaveBeenCalled();
      expect(mockElectronAPI.onTabClosed).toHaveBeenCalled();
    });

    it('should register IPC listeners', () => {
      initializeIPC();

      expect(mockElectronAPI.onTabCreated).toHaveBeenCalled();
      expect(mockElectronAPI.onTabClosed).toHaveBeenCalled();
      expect(mockElectronAPI.onTabTitleUpdated).toHaveBeenCalled();
      expect(mockElectronAPI.onTabUrlUpdated).toHaveBeenCalled();
      expect(mockElectronAPI.onActiveTabChanged).toHaveBeenCalled();
    });

    it('should load initial tabs on initialization', async () => {
      const mockTabs = [
        { id: 'tab-1', title: 'Tab 1', url: 'https://1.com', type: 'webpage' },
        { id: 'tab-2', title: 'Tab 2', url: 'https://2.com', type: 'webpage' },
      ];

      mockElectronAPI.getActiveTabs.mockResolvedValue({
        tabs: mockTabs,
        activeTabId: 'tab-1',
      });

      initializeIPC();

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      const tabs = get(activeTabs);
      expect(tabs.size).toBe(2);
      expect(get(activeTabId)).toBe('tab-1');
    });

    it('should call electron API methods', async () => {
      const api = initializeIPC();

      await api.openUrl('https://example.com');
      expect(mockElectronAPI.openUrl).toHaveBeenCalledWith('https://example.com');

      await api.closeTab('tab-1');
      expect(mockElectronAPI.closeTab).toHaveBeenCalledWith('tab-1');

      await api.setActiveTab('tab-1');
      expect(mockElectronAPI.setActiveTab).toHaveBeenCalledWith('tab-1');
    });

    it('should expose all required API methods', () => {
      const api = initializeIPC();

      expect(api.openUrl).toBeDefined();
      expect(api.closeTab).toBeDefined();
      expect(api.setActiveTab).toBeDefined();
      expect(api.selectTabs).toBeDefined();
      expect(api.getBookmarks).toBeDefined();
      expect(api.addBookmark).toBeDefined();
      expect(api.sendQuery).toBeDefined();
    });
  });

  describe('Event handlers', () => {
    let mockElectronAPI;
    let eventHandlers;

    beforeEach(() => {
      eventHandlers = {};

      mockElectronAPI = {
        openUrl: vi.fn(),
        closeTab: vi.fn(),
        setActiveTab: vi.fn(),
        selectTabs: vi.fn(),
        getBookmarks: vi.fn().mockResolvedValue([]),
        addBookmark: vi.fn(),
        sendQuery: vi.fn(),
        getActiveTabs: vi.fn().mockResolvedValue({ tabs: [], activeTabId: null }),
        onTabCreated: vi.fn((callback) => { eventHandlers.tabCreated = callback; }),
        onTabClosed: vi.fn((callback) => { eventHandlers.tabClosed = callback; }),
        onTabTitleUpdated: vi.fn((callback) => { eventHandlers.tabTitleUpdated = callback; }),
        onTabUrlUpdated: vi.fn((callback) => { eventHandlers.tabUrlUpdated = callback; }),
        onActiveTabChanged: vi.fn((callback) => { eventHandlers.activeTabChanged = callback; }),
      };

      window.electronAPI = mockElectronAPI;
    });

    it('should update store when tab is created', () => {
      initializeIPC();

      const newTab = { id: 'tab-1', title: 'New Tab', url: 'https://new.com', type: 'webpage' };
      eventHandlers.tabCreated({ tab: newTab });

      const tabs = get(activeTabs);
      expect(tabs.has('tab-1')).toBe(true);
      expect(tabs.get('tab-1')).toEqual(newTab);
    });

    it('should update store when tab is closed', () => {
      initializeIPC();

      // Add a tab first
      activeTabs.set(new Map([['tab-1', { id: 'tab-1', title: 'Tab', url: 'https://test.com' }]]));

      // Trigger close event
      eventHandlers.tabClosed({ id: 'tab-1' });

      const tabs = get(activeTabs);
      expect(tabs.has('tab-1')).toBe(false);
    });

    it('should update tab title when title is updated', () => {
      initializeIPC();

      // Add a tab first
      activeTabs.set(new Map([['tab-1', { id: 'tab-1', title: 'Old', url: 'https://test.com' }]]));

      // Trigger title update
      eventHandlers.tabTitleUpdated({ id: 'tab-1', title: 'New Title' });

      const tabs = get(activeTabs);
      expect(tabs.get('tab-1').title).toBe('New Title');
    });

    it('should update tab URL when URL is updated', () => {
      initializeIPC();

      // Add a tab first
      activeTabs.set(new Map([['tab-1', { id: 'tab-1', title: 'Tab', url: 'https://old.com' }]]));

      // Trigger URL update
      eventHandlers.tabUrlUpdated({ id: 'tab-1', url: 'https://new.com' });

      const tabs = get(activeTabs);
      expect(tabs.get('tab-1').url).toBe('https://new.com');
    });

    it('should update active tab when active tab changes', () => {
      initializeIPC();

      eventHandlers.activeTabChanged({ id: 'tab-2' });

      expect(get(activeTabId)).toBe('tab-2');
    });
  });
});
