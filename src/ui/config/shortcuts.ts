/**
 * Keyboard shortcuts configuration
 * Chrome-like keyboard shortcuts for the LLM browser
 */

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: string;
}

export interface ShortcutAction {
  focusUrlInput: () => void;
  closeActiveTab: () => void;
  bookmarkActiveTab: () => void;
}

/**
 * Keyboard shortcuts configuration
 * Following Chrome/browser conventions
 */
export const shortcuts: ShortcutConfig[] = [
  {
    key: 'l',
    ctrl: true,
    description: 'Focus URL input (address bar)',
    action: 'focusUrlInput',
  },
  {
    key: 'w',
    ctrl: true,
    description: 'Close active tab',
    action: 'closeActiveTab',
  },
  {
    key: 'd',
    ctrl: true,
    description: 'Bookmark current tab',
    action: 'bookmarkActiveTab',
  },
];

/**
 * Check if a keyboard event matches a shortcut configuration
 */
export function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  const keyMatches = event.key.toLowerCase() === config.key.toLowerCase();
  const ctrlMatches = config.ctrl ? event.ctrlKey : !event.ctrlKey;
  const altMatches = config.alt ? event.altKey : !event.altKey;
  const shiftMatches = config.shift ? event.shiftKey : !event.shiftKey;
  const metaMatches = config.meta ? event.metaKey : !event.metaKey;

  return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
}

/**
 * Format shortcut for display (e.g., "Ctrl+L")
 */
export function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];

  if (config.ctrl) parts.push('Ctrl');
  if (config.alt) parts.push('Alt');
  if (config.shift) parts.push('Shift');
  if (config.meta) parts.push('Meta');

  parts.push(config.key.toUpperCase());

  return parts.join('+');
}
