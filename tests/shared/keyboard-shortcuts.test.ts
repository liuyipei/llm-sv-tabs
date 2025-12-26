import { describe, it, expect } from 'vitest';
import {
  shortcutDefinitions,
  matchesKeyboardShortcut,
  matchesInputShortcut,
  formatShortcut,
  formatChord,
  resolvePlatform,
  getShortcutDictionaryByCategory,
  type ShortcutDefinition,
} from '../../src/shared/keyboard-shortcuts.js';

describe('keyboard-shortcuts registry', () => {
  describe('shortcutDefinitions', () => {
    it('should include openNewWindow shortcut with Ctrl+N', () => {
      const openNewWindow = shortcutDefinitions.find((def) => def.id === 'openNewWindow');
      expect(openNewWindow).toBeDefined();
      expect(openNewWindow!.chords).toContainEqual({ key: 'n', ctrl: true });
    });

    it('should have all required shortcut actions', () => {
      const requiredActions = [
        'focusUrlInput',
        'focusUrlInputFromNewTab',
        'focusLLMInput',
        'closeActiveTab',
        'bookmarkActiveTab',
        'toggleSearchBar',
        'reloadActiveTab',
        'triggerScreenshot',
        'goBack',
        'goForward',
        'nextTab',
        'previousTab',
        'openNewWindow',
      ];

      for (const action of requiredActions) {
        const found = shortcutDefinitions.find((def) => def.id === action);
        expect(found, `Missing shortcut: ${action}`).toBeDefined();
      }
    });

    it('should have valid categories for all shortcuts', () => {
      const validCategories = ['Focus', 'Navigation', 'Tab Management', 'Search', 'Actions'];
      for (const def of shortcutDefinitions) {
        expect(validCategories).toContain(def.category);
      }
    });
  });

  describe('resolvePlatform', () => {
    it('should resolve darwin to mac', () => {
      expect(resolvePlatform('darwin')).toBe('mac');
    });

    it('should resolve win32 to windows', () => {
      expect(resolvePlatform('win32')).toBe('windows');
    });

    it('should resolve linux to linux', () => {
      expect(resolvePlatform('linux')).toBe('linux');
    });

    it('should pass through normalized platform names', () => {
      expect(resolvePlatform('mac')).toBe('mac');
      expect(resolvePlatform('windows')).toBe('windows');
    });
  });

  describe('matchesInputShortcut (Electron before-input-event)', () => {
    const openNewWindow = shortcutDefinitions.find((def) => def.id === 'openNewWindow')!;
    const focusLLMInput = shortcutDefinitions.find((def) => def.id === 'focusLLMInput')!;

    it('should match Ctrl+N for openNewWindow on Windows', () => {
      const input = { type: 'keyDown' as const, key: 'n', control: true };
      expect(matchesInputShortcut(input, openNewWindow, 'windows')).toBe(true);
    });

    it('should match Ctrl+N for openNewWindow on Linux', () => {
      const input = { type: 'keyDown' as const, key: 'n', control: true };
      expect(matchesInputShortcut(input, openNewWindow, 'linux')).toBe(true);
    });

    it('should match Cmd+N for openNewWindow on Mac', () => {
      const input = { type: 'keyDown' as const, key: 'n', meta: true };
      expect(matchesInputShortcut(input, openNewWindow, 'mac')).toBe(true);
    });

    it('should match Ctrl+. for focusLLMInput on Windows', () => {
      const input = { type: 'keyDown' as const, key: '.', control: true };
      expect(matchesInputShortcut(input, focusLLMInput, 'windows')).toBe(true);
    });

    it('should not match when extra modifiers are present', () => {
      const input = { type: 'keyDown' as const, key: 'n', control: true, shift: true };
      expect(matchesInputShortcut(input, openNewWindow, 'windows')).toBe(false);
    });

    it('should not match keyUp events', () => {
      const input = { type: 'keyUp' as const, key: 'n', control: true };
      expect(matchesInputShortcut(input, openNewWindow, 'windows')).toBe(false);
    });

    it('should be case-insensitive for key matching', () => {
      const input = { type: 'keyDown' as const, key: 'N', control: true };
      expect(matchesInputShortcut(input, openNewWindow, 'windows')).toBe(true);
    });
  });

  describe('matchesKeyboardShortcut (DOM KeyboardEvent)', () => {
    const openNewWindow = shortcutDefinitions.find((def) => def.id === 'openNewWindow')!;

    function createKeyboardEvent(options: {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
    }): KeyboardEvent {
      return {
        key: options.key,
        ctrlKey: options.ctrlKey ?? false,
        metaKey: options.metaKey ?? false,
        altKey: options.altKey ?? false,
        shiftKey: options.shiftKey ?? false,
      } as KeyboardEvent;
    }

    it('should match Ctrl+N on Windows', () => {
      const event = createKeyboardEvent({ key: 'n', ctrlKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindow, 'windows')).toBe(true);
    });

    it('should match Cmd+N on Mac', () => {
      const event = createKeyboardEvent({ key: 'n', metaKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindow, 'mac')).toBe(true);
    });

    it('should also match Ctrl+N on Mac (Ctrl key still works)', () => {
      const event = createKeyboardEvent({ key: 'n', ctrlKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindow, 'mac')).toBe(true);
    });
  });

  describe('formatShortcut', () => {
    const openNewWindow = shortcutDefinitions.find((def) => def.id === 'openNewWindow')!;

    it('should format as Ctrl+N on Windows', () => {
      const formatted = formatShortcut(openNewWindow, 'windows');
      expect(formatted).toContain('Ctrl+N');
    });

    it('should format as Cmd+N on Mac', () => {
      const formatted = formatShortcut(openNewWindow, 'mac');
      expect(formatted).toContain('Cmd+N');
    });

    it('should format as Ctrl+N on Linux', () => {
      const formatted = formatShortcut(openNewWindow, 'linux');
      expect(formatted).toContain('Ctrl+N');
    });
  });

  describe('formatChord', () => {
    it('should format Alt as Option on Mac', () => {
      const chord = { key: 's', ctrl: true, alt: true };
      expect(formatChord(chord, 'mac')).toBe('Cmd+Option+S');
    });

    it('should format Alt as Alt on Windows', () => {
      const chord = { key: 's', ctrl: true, alt: true };
      expect(formatChord(chord, 'windows')).toBe('Ctrl+Alt+S');
    });

    it('should format arrow keys with symbols', () => {
      const chord = { key: 'arrowleft', alt: true };
      expect(formatChord(chord, 'windows')).toBe('Alt+←');
    });
  });

  describe('getShortcutDictionaryByCategory', () => {
    it('should group shortcuts by category', () => {
      const grouped = getShortcutDictionaryByCategory('windows');
      expect(grouped['Tab Management']).toBeDefined();
      expect(grouped['Tab Management'].some((def) => def.id === 'openNewWindow')).toBe(true);
    });

    it('should filter out platform-specific shortcuts on other platforms', () => {
      const macGrouped = getShortcutDictionaryByCategory('mac');
      const windowsGrouped = getShortcutDictionaryByCategory('windows');

      // goBack has a mac-only Cmd+[ chord
      const goBackMac = macGrouped['Navigation']?.find((def) => def.id === 'goBack');
      const goBackWin = windowsGrouped['Navigation']?.find((def) => def.id === 'goBack');

      // Both platforms should have goBack, but with different chord counts
      expect(goBackMac).toBeDefined();
      expect(goBackWin).toBeDefined();
    });
  });

  describe('platform-specific chords', () => {
    it('should have mac-specific Cmd+[ for goBack', () => {
      const goBack = shortcutDefinitions.find((def) => def.id === 'goBack')!;
      const macChord = goBack.chords.find((c) => c.platform === 'mac' && c.key === '[');
      expect(macChord).toBeDefined();
      expect(macChord!.meta).toBe(true);
    });

    it('should have mac-specific Cmd+Option+Arrow for tab switching', () => {
      const nextTab = shortcutDefinitions.find((def) => def.id === 'nextTab')!;
      const macChord = nextTab.chords.find((c) => c.platform === 'mac');
      expect(macChord).toBeDefined();
      expect(macChord!.meta).toBe(true);
      expect(macChord!.alt).toBe(true);
    });
  });
});
