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
  toggleSearchBar: () => void;
}

/**
 * Keyboard shortcuts configuration
 * Following Chrome/browser conventions with LLM-specific additions
 *
 * Note: The main process application menu handles these accelerators so they
 * work even when a WebContentsView has focus. This configuration is retained
 * for documentation/tooltips.
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
  {
    key: 'f',
    ctrl: true,
    description: 'Find in page',
    action: 'toggleSearchBar',
  },
];

/**
 * All keyboard shortcuts for documentation and tooltips
 * Includes shortcuts handled by both renderer and main process
 */
export const allShortcuts = {
  // Tab management
  closeTab: { key: 'W', modifiers: ['Ctrl'], description: 'Close active tab' },
  newTab: { key: 'T', modifiers: ['Ctrl'], description: 'New tab (focus URL bar)' },
  nextTab: { key: 'Tab', modifiers: ['Ctrl'], description: 'Next tab' },
  previousTab: { key: 'Tab', modifiers: ['Ctrl', 'Shift'], description: 'Previous tab' },

  // Navigation
  goBack: { key: 'Left', modifiers: ['Alt'], description: 'Go back' },
  goForward: { key: 'Right', modifiers: ['Alt'], description: 'Go forward' },
  reload: { key: 'R', modifiers: ['Ctrl'], description: 'Reload page' },

  // Focus
  focusUrlBar: { key: 'L', modifiers: ['Ctrl'], description: 'Focus URL bar' },
  focusLLMInput: { key: '.', modifiers: ['Ctrl'], description: 'Focus LLM input' },

  // Actions
  bookmark: { key: 'D', modifiers: ['Ctrl'], description: 'Bookmark current tab' },
  findInPage: { key: 'F', modifiers: ['Ctrl'], description: 'Find in page' },
  screenshot: { key: 'S', modifiers: ['Ctrl', 'Alt'], description: 'Capture screenshot' },
};

/**
 * Format a shortcut for tooltip display
 * Returns platform-appropriate string (e.g., "Ctrl+W" on Windows/Linux, "Cmd+W" on Mac)
 */
export function formatShortcutForTooltip(shortcut: { key: string; modifiers: string[] }): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  const modifierMap: Record<string, string> = {
    'Ctrl': isMac ? 'Cmd' : 'Ctrl',
    'Alt': isMac ? 'Option' : 'Alt',
    'Shift': 'Shift',
    'Meta': isMac ? 'Cmd' : 'Win',
  };

  const formattedModifiers = shortcut.modifiers.map(m => modifierMap[m] || m);
  return [...formattedModifiers, shortcut.key].join('+');
}

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
