import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  isLoading,
  menuCollapsed,
  bookmarksCollapsed,
  settingsVisible,
  searchQuery,
  activeModal,
  chatMessages,
  queryInput,
  urlInput,
  addChatMessage,
  clearChatMessages,
  showModal,
  hideModal,
} from '../../src/ui/stores/ui.js';

describe('ui store', () => {
  beforeEach(() => {
    // Reset stores before each test
    isLoading.set(false);
    menuCollapsed.set(false);
    bookmarksCollapsed.set(false);
    settingsVisible.set(false);
    searchQuery.set('');
    activeModal.set(null);
    chatMessages.set([]);
    queryInput.set('');
    urlInput.set('');
  });

  describe('basic ui state', () => {
    it('should initialize with default values', () => {
      expect(get(isLoading)).toBe(false);
      expect(get(menuCollapsed)).toBe(false);
      expect(get(bookmarksCollapsed)).toBe(false);
      expect(get(settingsVisible)).toBe(false);
      expect(get(searchQuery)).toBe('');
      expect(get(activeModal)).toBe(null);
    });

    it('should toggle loading state', () => {
      isLoading.set(true);
      expect(get(isLoading)).toBe(true);

      isLoading.set(false);
      expect(get(isLoading)).toBe(false);
    });

    it('should toggle menu collapsed state', () => {
      menuCollapsed.set(true);
      expect(get(menuCollapsed)).toBe(true);

      menuCollapsed.set(false);
      expect(get(menuCollapsed)).toBe(false);
    });

    it('should toggle bookmarks collapsed state', () => {
      bookmarksCollapsed.set(true);
      expect(get(bookmarksCollapsed)).toBe(true);
    });

    it('should update search query', () => {
      searchQuery.set('test query');
      expect(get(searchQuery)).toBe('test query');
    });
  });

  describe('chat messages', () => {
    it('should start with empty messages', () => {
      expect(get(chatMessages)).toEqual([]);
    });

    it('should add a chat message', () => {
      const message = {
        id: 1,
        role: 'user',
        content: 'Hello',
      };

      addChatMessage(message);
      expect(get(chatMessages)).toHaveLength(1);
      expect(get(chatMessages)[0]).toEqual(message);
    });

    it('should add multiple messages', () => {
      addChatMessage({ id: 1, role: 'user', content: 'Hello' });
      addChatMessage({ id: 2, role: 'assistant', content: 'Hi there' });

      expect(get(chatMessages)).toHaveLength(2);
    });

    it('should clear all messages', () => {
      addChatMessage({ id: 1, role: 'user', content: 'Hello' });
      addChatMessage({ id: 2, role: 'assistant', content: 'Hi there' });

      clearChatMessages();
      expect(get(chatMessages)).toEqual([]);
    });

    it('should preserve message order', () => {
      addChatMessage({ id: 1, role: 'user', content: 'First' });
      addChatMessage({ id: 2, role: 'assistant', content: 'Second' });
      addChatMessage({ id: 3, role: 'user', content: 'Third' });

      const messages = get(chatMessages);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('modal management', () => {
    it('should show modal', () => {
      showModal('settings');
      expect(get(activeModal)).toBe('settings');
    });

    it('should hide modal', () => {
      showModal('settings');
      hideModal();
      expect(get(activeModal)).toBe(null);
    });

    it('should switch between modals', () => {
      showModal('settings');
      expect(get(activeModal)).toBe('settings');

      showModal('recently-closed');
      expect(get(activeModal)).toBe('recently-closed');
    });
  });

  describe('input state', () => {
    it('should update query input', () => {
      queryInput.set('What is this page about?');
      expect(get(queryInput)).toBe('What is this page about?');
    });

    it('should update url input', () => {
      urlInput.set('https://example.com');
      expect(get(urlInput)).toBe('https://example.com');
    });

    it('should clear inputs', () => {
      queryInput.set('some query');
      urlInput.set('some url');

      queryInput.set('');
      urlInput.set('');

      expect(get(queryInput)).toBe('');
      expect(get(urlInput)).toBe('');
    });
  });

  describe('reactivity', () => {
    it('should notify subscribers when chat messages change', () => {
      let messageCount = 0;
      const unsubscribe = chatMessages.subscribe((msgs) => {
        messageCount = msgs.length;
      });

      addChatMessage({ id: 1, role: 'user', content: 'Test' });
      expect(messageCount).toBe(1);

      addChatMessage({ id: 2, role: 'assistant', content: 'Response' });
      expect(messageCount).toBe(2);

      unsubscribe();
    });

    it('should notify subscribers when modal changes', () => {
      let currentModal;
      const unsubscribe = activeModal.subscribe((modal) => {
        currentModal = modal;
      });

      showModal('settings');
      expect(currentModal).toBe('settings');

      hideModal();
      expect(currentModal).toBe(null);

      unsubscribe();
    });
  });
});
