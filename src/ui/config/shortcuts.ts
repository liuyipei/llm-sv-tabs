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
  reloadActiveTab: () => void;
  triggerScreenshot: () => void;
  goBack: () => void;
  goForward: () => void;
  nextTab: () => void;
  previousTab: () => void;
}

/**
 * Keyboard shortcuts configuration
 * Following Chrome/browser conventions with LLM-specific additions
 *
 * These shortcuts are handled by the renderer when the UI panel is focused.
 * When the browser content (WebContentsView) is focused, shortcuts are handled
 * by before-input-event handlers in tab-manager.ts.
 */
export const shortcuts: ShortcutConfig[] = [
  // Focus shortcuts
  {
    key: 'l',
    ctrl: true,
    description: 'Focus URL input (address bar)',
    action: 'focusUrlInput',
  },
  {
    key: 't',
    ctrl: true,
    description: 'New tab (focus URL bar)',
    action: 'focusUrlInput',
  },
  {
    key: '.',
    ctrl: true,
    description: 'Focus LLM query input',
    action: 'focusLLMInput',
  },
  // Tab management
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
    key: 'r',
    ctrl: true,
    description: 'Reload current tab',
    action: 'reloadActiveTab',
  },
  {
    key: 'f',
    ctrl: true,
    description: 'Find in page',
    action: 'toggleSearchBar',
  },
  // Screenshot
  {
    key: 's',
    ctrl: true,
    alt: true,
    description: 'Capture screenshot',
    action: 'triggerScreenshot',
  },
  // Navigation
  {
    key: 'ArrowLeft',
    alt: true,
    description: 'Go back',
    action: 'goBack',
  },
  {
    key: 'ArrowRight',
    alt: true,
    description: 'Go forward',
    action: 'goForward',
  },
  // Tab switching
  {
    key: 'Tab',
    ctrl: true,
    description: 'Next tab',
    action: 'nextTab',
  },
  {
    key: 'Tab',
    ctrl: true,
    shift: true,
    description: 'Previous tab',
    action: 'previousTab',
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
