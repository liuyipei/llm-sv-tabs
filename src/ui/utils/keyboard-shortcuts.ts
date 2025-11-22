/**
 * Keyboard shortcuts handler utility
 * Manages keyboard event listeners and dispatches actions
 */

import { shortcuts, matchesShortcut, type ShortcutAction } from '../config/shortcuts';

/**
 * Initialize keyboard shortcuts
 * @param actions - Map of action names to handler functions
 * @returns Cleanup function to remove event listener
 */
export function initKeyboardShortcuts(actions: ShortcutAction): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    // Find matching shortcut
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        // Prevent default browser behavior
        event.preventDefault();
        event.stopPropagation();

        // Execute the action
        const actionName = shortcut.action as keyof ShortcutAction;
        const action = actions[actionName];

        if (action && typeof action === 'function') {
          action();
        } else {
          console.warn(`No action handler found for: ${shortcut.action}`);
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
