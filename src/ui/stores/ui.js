import { writable } from 'svelte/store';

// UI state stores
export const isLoading = writable(false);
export const menuCollapsed = writable(false);
export const bookmarksCollapsed = writable(false);
export const settingsVisible = writable(false);
export const searchQuery = writable('');
export const activeModal = writable(null); // 'recently-closed' | 'settings' | null

// Chat state
export const chatMessages = writable([]);
export const queryInput = writable('');
export const urlInput = writable('');

// Helper functions
export function addChatMessage(message) {
  chatMessages.update((messages) => [...messages, message]);
}

export function clearChatMessages() {
  chatMessages.set([]);
}

export function showModal(modalName) {
  activeModal.set(modalName);
}

export function hideModal() {
  activeModal.set(null);
}
