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
  focusLLMInput: () => void;
  closeActiveTab: () => void;
  bookmarkActiveTab: () => void;
}

/**
 * Keyboard shortcuts configuration
 * Following Chrome/browser conventions with LLM-specific additions
 */
export const shortcuts: ShortcutConfig[] = [
  {
    key: 'l',
    ctrl: true,
    description: 'Focus URL input (address bar)',
    action: 'focusUrlInput',
  },
  {
    key: '.',
    ctrl: true,
    description: 'Focus LLM query input',
    action: 'focusLLMInput',
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
 * On Mac, treats Cmd (meta) as equivalent to Ctrl for cross-platform shortcuts
 */
export function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  const keyMatches = event.key.toLowerCase() === config.key.toLowerCase();

  // On Mac, treat Cmd (meta) as Ctrl for cross-platform shortcuts
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

  const ctrlMatches = config.ctrl ? ctrlOrCmd : !ctrlOrCmd;
  const altMatches = config.alt ? event.altKey : !event.altKey;
  const shiftMatches = config.shift ? event.shiftKey : !event.shiftKey;

  // Don't check metaKey if ctrl is being used as the modifier
  // (since we're treating them as equivalent on Mac)
  const metaMatches = config.meta ? event.metaKey : (config.ctrl && isMac ? true : !event.metaKey);

  return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
}

/**
 * Format shortcut for display (e.g., "Ctrl+L" on Windows/Linux, "Cmd+L" on Mac)
 */
export function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];
  const isMac = navigator.platform.toLowerCase().includes('mac');

  if (config.ctrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (config.alt) parts.push('Alt');
  if (config.shift) parts.push('Shift');
  if (config.meta) parts.push('Meta');

  parts.push(config.key.toUpperCase());

  return parts.join('+');
}
