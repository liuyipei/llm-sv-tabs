/**
 * Keyboard shortcuts handler utility
 * Manages keyboard event listeners and dispatches actions
 */

import {
  shortcutDefinitions,
  matchesKeyboardShortcut,
  type ShortcutActionId,
} from '../../shared/keyboard-shortcuts.js';

export type ShortcutAction = Record<ShortcutActionId, () => void>;

/**
 * Initialize keyboard shortcuts
 * @param actions - Map of action names to handler functions
 * @returns Cleanup function to remove event listener
 */
export function initKeyboardShortcuts(actions: ShortcutAction): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    // Debug: log Ctrl+N events
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      console.log('[DEBUG UI keyboard] Ctrl+N detected:', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
    }

    // Find matching shortcut
    for (const shortcut of shortcutDefinitions) {
      if (matchesKeyboardShortcut(event, shortcut)) {
        console.log('[DEBUG UI keyboard] Matched shortcut:', shortcut.id);
        // Prevent default browser behavior
        event.preventDefault();
        event.stopPropagation();

        const action = actions[shortcut.id];

        if (action && typeof action === 'function') {
          console.log('[DEBUG UI keyboard] Calling action for:', shortcut.id);
          action();
        } else {
          console.warn(`No action handler found for: ${shortcut.id}`);
        }

        break;
      }
    }
  };

  // Add event listener
  window.addEventListener('keydown', handleKeyDown);
  console.log('[DEBUG UI keyboard] Keyboard shortcuts initialized');

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
