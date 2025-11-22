import { writable, type Writable } from 'svelte/store';
import type { ChatMessage } from '../../types';

type ModalType = 'recently-closed' | 'settings' | null;
type SidebarView = 'chat' | 'settings' | 'bookmarks' | 'notes';

// UI state stores
export const isLoading: Writable<boolean> = writable(false);
export const menuCollapsed: Writable<boolean> = writable(false);
export const bookmarksCollapsed: Writable<boolean> = writable(false);
export const settingsVisible: Writable<boolean> = writable(false);
export const searchQuery: Writable<string> = writable('');
export const activeModal: Writable<ModalType> = writable(null);
export const activeSidebarView: Writable<SidebarView> = writable('chat');

// Chat state
export const chatMessages: Writable<ChatMessage[]> = writable([]);
export const queryInput: Writable<string> = writable('');
export const urlInput: Writable<string> = writable('');

// Helper functions
export function addChatMessage(message: ChatMessage): void {
  chatMessages.update((messages) => [...messages, message]);
}

export function clearChatMessages(): void {
  chatMessages.set([]);
}

export function showModal(modalName: ModalType): void {
  activeModal.set(modalName);
}

export function hideModal(): void {
  activeModal.set(null);
}
