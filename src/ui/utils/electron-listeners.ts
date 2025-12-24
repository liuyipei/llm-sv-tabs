/**
 * Electron IPC event listener setup.
 * Handles events from the main process that need to trigger UI actions.
 */

interface ElectronListenerCallbacks {
  focusUrlInput: () => void;
  focusLLMInput: () => void;
  showSearchBar: () => void;
  navigateToNextTab: () => Promise<void>;
  navigateToPreviousTab: () => Promise<void>;
  bookmarkActiveTab: () => Promise<void>;
  triggerScreenshot: () => Promise<void>;
}

/**
 * Set up IPC listeners for Electron events.
 * Returns a cleanup function to remove all listeners.
 */
export function setupElectronListeners(callbacks: ElectronListenerCallbacks): () => void {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return () => {}; // No-op cleanup for non-Electron environments
  }

  const api = window.electronAPI;

  // Focus URL bar (triggered by global shortcut)
  api.onFocusUrlBar(() => {
    callbacks.focusUrlInput();
  });

  // Focus search bar (triggered by Ctrl+F global shortcut)
  api.onFocusSearchBar(() => {
    callbacks.showSearchBar();
  });

  // Focus LLM input
  if (api.onFocusLLMInput) {
    api.onFocusLLMInput(() => {
      callbacks.focusLLMInput();
    });
  }

  // Tab navigation using sorted order
  if (api.onNavigateNextTab) {
    api.onNavigateNextTab(() => {
      callbacks.navigateToNextTab();
    });
  }

  if (api.onNavigatePreviousTab) {
    api.onNavigatePreviousTab(() => {
      callbacks.navigateToPreviousTab();
    });
  }

  // Bookmark shortcut from browser view
  if (api.onBookmarkTab) {
    api.onBookmarkTab(() => {
      callbacks.bookmarkActiveTab();
    });
  }

  // Screenshot shortcut from browser view
  if (api.onTriggerScreenshot) {
    api.onTriggerScreenshot(() => {
      callbacks.triggerScreenshot();
    });
  }

  // Return cleanup function (listeners are automatically cleaned up by Electron)
  return () => {};
}
