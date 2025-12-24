export type ShortcutPlatform = 'mac' | 'windows' | 'linux';

export type ShortcutActionId =
  | 'focusUrlInput'
  | 'focusLLMInput'
  | 'closeActiveTab'
  | 'bookmarkActiveTab'
  | 'toggleSearchBar'
  | 'reloadActiveTab'
  | 'triggerScreenshot'
  | 'goBack'
  | 'goForward'
  | 'nextTab'
  | 'previousTab';

export interface ShortcutChord {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  platform?: ShortcutPlatform;
}

export interface ShortcutDefinition {
  id: ShortcutActionId;
  description: string;
  category: 'Focus' | 'Navigation' | 'Tab Management' | 'Search' | 'Actions';
  chords: ShortcutChord[];
}

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    id: 'focusUrlInput',
    description: 'Focus URL bar / new tab',
    category: 'Focus',
    chords: [
      { key: 'l', ctrl: true },
      { key: 't', ctrl: true },
    ],
  },
  {
    id: 'focusLLMInput',
    description: 'Focus LLM input',
    category: 'Focus',
    chords: [{ key: '.', ctrl: true }],
  },
  {
    id: 'closeActiveTab',
    description: 'Close active tab',
    category: 'Tab Management',
    chords: [{ key: 'w', ctrl: true }],
  },
  {
    id: 'bookmarkActiveTab',
    description: 'Bookmark current tab',
    category: 'Actions',
    chords: [{ key: 'd', ctrl: true }],
  },
  {
    id: 'reloadActiveTab',
    description: 'Reload current tab',
    category: 'Navigation',
    chords: [{ key: 'r', ctrl: true }],
  },
  {
    id: 'toggleSearchBar',
    description: 'Find in page',
    category: 'Search',
    chords: [{ key: 'f', ctrl: true }],
  },
  {
    id: 'triggerScreenshot',
    description: 'Capture screenshot',
    category: 'Actions',
    chords: [{ key: 's', ctrl: true, alt: true }],
  },
  {
    id: 'goBack',
    description: 'Go back',
    category: 'Navigation',
    chords: [
      { key: 'arrowleft', alt: true },
      { key: '[', meta: true, platform: 'mac' },
    ],
  },
  {
    id: 'goForward',
    description: 'Go forward',
    category: 'Navigation',
    chords: [
      { key: 'arrowright', alt: true },
      { key: ']', meta: true, platform: 'mac' },
    ],
  },
  {
    id: 'nextTab',
    description: 'Next tab',
    category: 'Tab Management',
    chords: [
      { key: 'tab', ctrl: true },
      { key: 'arrowright', meta: true, alt: true, platform: 'mac' },
    ],
  },
  {
    id: 'previousTab',
    description: 'Previous tab',
    category: 'Tab Management',
    chords: [
      { key: 'tab', ctrl: true, shift: true },
      { key: 'arrowleft', meta: true, alt: true, platform: 'mac' },
    ],
  },
];

export function resolvePlatform(platformHint?: ShortcutPlatform | NodeJS.Platform | string): ShortcutPlatform {
  if (platformHint === 'darwin') return 'mac';
  if (platformHint === 'win32') return 'windows';
  if (platformHint === 'linux') return 'linux';

  if (platformHint === 'mac' || platformHint === 'windows' || platformHint === 'linux') {
    return platformHint;
  }

  if (typeof navigator !== 'undefined' && navigator.platform) {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('win')) return 'windows';
    if (platform.includes('linux')) return 'linux';
  }

  if (typeof process !== 'undefined' && process.platform) {
    return resolvePlatform(process.platform);
  }

  return 'windows';
}

function isMac(platformHint?: ShortcutPlatform | NodeJS.Platform | string): boolean {
  return resolvePlatform(platformHint) === 'mac';
}

function chordAppliesToPlatform(chord: ShortcutChord, platform: ShortcutPlatform): boolean {
  if (!chord.platform) return true;
  return chord.platform === platform;
}

function normalizeKey(value: string): string {
  return value.toLowerCase();
}

function formatKeyForDisplay(key: string): string {
  const normalized = normalizeKey(key);
  if (normalized === 'arrowleft') return '←';
  if (normalized === 'arrowright') return '→';
  if (normalized === 'tab') return 'Tab';
  if (normalized.length === 1) return normalized.toUpperCase();
  return key.length > 1 ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

function chordMatchesKeyboardEvent(event: KeyboardEvent, chord: ShortcutChord, platformHint?: ShortcutPlatform | NodeJS.Platform | string): boolean {
  const mac = isMac(platformHint);
  const keyMatches = normalizeKey(event.key) === normalizeKey(chord.key);
  if (!keyMatches) return false;

  const ctrlPressed = !!event.ctrlKey;
  const metaPressed = !!event.metaKey;
  const ctrlOrCmd = mac ? metaPressed || ctrlPressed : ctrlPressed;

  if (!!chord.alt !== event.altKey) return false;
  if (!!chord.shift !== event.shiftKey) return false;
  if (chord.meta !== undefined && chord.meta !== metaPressed) return false;

  if (chord.ctrl) {
    if (!ctrlOrCmd) return false;
  } else if (ctrlOrCmd) {
    const metaOnlyForChord = mac && chord.meta && metaPressed && !ctrlPressed;
    if (!metaOnlyForChord) return false;
  }

  return true;
}

type ElectronInputEvent = {
  key: string;
  type: 'keyDown' | string;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

function chordMatchesInputEvent(input: ElectronInputEvent, chord: ShortcutChord, platformHint?: ShortcutPlatform | NodeJS.Platform | string): boolean {
  if (input.type !== 'keyDown') return false;

  const mac = isMac(platformHint);
  const keyMatches = normalizeKey(input.key) === normalizeKey(chord.key);
  if (!keyMatches) return false;

  const ctrlPressed = !!input.control;
  const metaPressed = !!input.meta;
  const ctrlOrCmd = mac ? metaPressed || ctrlPressed : ctrlPressed;

  if (!!chord.alt !== !!input.alt) return false;
  if (!!chord.shift !== !!input.shift) return false;
  if (chord.meta !== undefined && chord.meta !== metaPressed) return false;

  if (chord.ctrl) {
    if (!ctrlOrCmd) return false;
  } else if (ctrlOrCmd) {
    const metaOnlyForChord = mac && chord.meta && metaPressed && !ctrlPressed;
    if (!metaOnlyForChord) return false;
  }

  return true;
}

export function matchesKeyboardShortcut(event: KeyboardEvent, definition: ShortcutDefinition, platformHint?: ShortcutPlatform | NodeJS.Platform | string): boolean {
  const platform = resolvePlatform(platformHint);
  return definition.chords.some((chord) => chordAppliesToPlatform(chord, platform) && chordMatchesKeyboardEvent(event, chord, platform));
}

export function matchesInputShortcut(input: ElectronInputEvent, definition: ShortcutDefinition, platformHint?: ShortcutPlatform | NodeJS.Platform | string): boolean {
  const platform = resolvePlatform(platformHint);
  return definition.chords.some((chord) => chordAppliesToPlatform(chord, platform) && chordMatchesInputEvent(input, chord, platform));
}

function formatModifier(modifier: 'Ctrl' | 'Alt' | 'Shift' | 'Meta', platform: ShortcutPlatform): string {
  if (modifier === 'Ctrl') return platform === 'mac' ? 'Cmd' : 'Ctrl';
  if (modifier === 'Alt') return platform === 'mac' ? 'Option' : 'Alt';
  if (modifier === 'Meta') return platform === 'mac' ? 'Cmd' : 'Win';
  return 'Shift';
}

export function formatChord(chord: ShortcutChord, platformHint?: ShortcutPlatform | NodeJS.Platform | string): string {
  const platform = resolvePlatform(platformHint);
  const parts: string[] = [];

  if (chord.ctrl) parts.push(formatModifier('Ctrl', platform));
  if (chord.alt) parts.push(formatModifier('Alt', platform));
  if (chord.shift) parts.push(formatModifier('Shift', platform));
  if (chord.meta) parts.push(formatModifier('Meta', platform));

  parts.push(formatKeyForDisplay(chord.key));

  return parts.join('+');
}

export function formatShortcut(definition: ShortcutDefinition, platformHint?: ShortcutPlatform | NodeJS.Platform | string): string[] {
  const platform = resolvePlatform(platformHint);
  return definition.chords
    .filter((chord) => chordAppliesToPlatform(chord, platform))
    .map((chord) => formatChord(chord, platform));
}

export function getShortcutDictionaryByCategory(platformHint?: ShortcutPlatform | NodeJS.Platform | string): Record<string, ShortcutDefinition[]> {
  const platform = resolvePlatform(platformHint);
  return shortcutDefinitions.reduce<Record<string, ShortcutDefinition[]>>((acc, definition) => {
    if (!definition.chords.some((chord) => chordAppliesToPlatform(chord, platform))) return acc;
    if (!acc[definition.category]) acc[definition.category] = [];
    acc[definition.category].push(definition);
    return acc;
  }, {});
}
