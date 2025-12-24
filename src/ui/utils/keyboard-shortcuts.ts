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
    // Find matching shortcut
    for (const shortcut of shortcutDefinitions) {
      if (matchesKeyboardShortcut(event, shortcut)) {
        // Prevent default browser behavior
        event.preventDefault();
        event.stopPropagation();

        const action = actions[shortcut.id];

        if (action && typeof action === 'function') {
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

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
