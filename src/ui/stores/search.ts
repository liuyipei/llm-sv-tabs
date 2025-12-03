import { writable } from 'svelte/store';

export interface SearchState {
  active: boolean;
  query: string;
  currentMatch: number;
  totalMatches: number;
}

function createSearchStore() {
  const { subscribe, set, update } = writable<SearchState>({
    active: false,
    query: '',
    currentMatch: 0,
    totalMatches: 0,
  });

  return {
    subscribe,
    setActive: (active: boolean) => update(state => ({ ...state, active })),
    setQuery: (query: string) => update(state => ({ ...state, query })),
    setMatches: (currentMatch: number, totalMatches: number) =>
      update(state => ({ ...state, currentMatch, totalMatches })),
    reset: () => set({
      active: false,
      query: '',
      currentMatch: 0,
      totalMatches: 0,
    }),
  };
}

export const searchStore = createSearchStore();
