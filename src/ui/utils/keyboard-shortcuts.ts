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
    // Debug: Log key presses that involve modifiers or special keys
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    if (ctrlOrMeta || event.altKey) {
      console.log('Keyboard event:', {
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
      });
    }

    // Find matching shortcut
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        console.log(`Keyboard shortcut matched: ${shortcut.action}`, { key: event.key });
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
