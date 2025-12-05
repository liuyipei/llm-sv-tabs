/**
 * Search state store for DOM-based search in Svelte component tabs.
 * Used to communicate search commands and results between SearchBar and content components.
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';

export interface SearchState {
  /** Current search text */
  searchText: string;
  /** Active match index (1-indexed for display) */
  activeMatchIndex: number;
  /** Total number of matches */
  totalMatches: number;
  /** Whether search is currently active */
  isActive: boolean;
  /** Search command to trigger action */
  command: 'search' | 'next' | 'previous' | 'clear' | null;
  /** Command sequence number to detect changes */
  commandSeq: number;
}

const initialState: SearchState = {
  searchText: '',
  activeMatchIndex: 0,
  totalMatches: 0,
  isActive: false,
  command: null,
  commandSeq: 0,
};

/**
 * The main search state store
 */
export const searchState: Writable<SearchState> = writable(initialState);

/**
 * Derived store for just the search results (active index and total matches)
 */
export const searchResults: Readable<{ activeMatchIndex: number; totalMatches: number }> = derived(
  searchState,
  ($state) => ({
    activeMatchIndex: $state.activeMatchIndex,
    totalMatches: $state.totalMatches,
  })
);

/**
 * Initiates a search with the given text
 */
export function performDOMSearch(text: string): void {
  searchState.update((state) => ({
    ...state,
    searchText: text,
    isActive: text.trim().length > 0,
    command: 'search',
    commandSeq: state.commandSeq + 1,
  }));
}

/**
 * Navigate to the next match
 */
export function findNextDOM(): void {
  searchState.update((state) => ({
    ...state,
    command: 'next',
    commandSeq: state.commandSeq + 1,
  }));
}

/**
 * Navigate to the previous match
 */
export function findPreviousDOM(): void {
  searchState.update((state) => ({
    ...state,
    command: 'previous',
    commandSeq: state.commandSeq + 1,
  }));
}

/**
 * Clear the search and highlights
 */
export function clearDOMSearch(): void {
  searchState.set(initialState);
}

/**
 * Update the search results (called by content components after processing search)
 */
export function updateSearchResults(activeMatchIndex: number, totalMatches: number): void {
  searchState.update((state) => ({
    ...state,
    activeMatchIndex,
    totalMatches,
    command: null, // Clear the command after it's been processed
  }));
}
