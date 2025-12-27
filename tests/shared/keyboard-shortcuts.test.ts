import { describe, it, expect } from 'vitest';
import {
  matchesInputShortcut,
  matchesKeyboardShortcut,
  shortcutDefinitions,
  resolvePlatform,
  formatChord,
  type ShortcutPlatform,
} from '../../src/shared/keyboard-shortcuts';

describe('keyboard-shortcuts', () => {
  describe('resolvePlatform', () => {
    it('should resolve win32 to windows', () => {
      expect(resolvePlatform('win32')).toBe('windows');
    });

    it('should resolve darwin to mac', () => {
      expect(resolvePlatform('darwin')).toBe('mac');
    });

    it('should resolve linux to linux', () => {
      expect(resolvePlatform('linux')).toBe('linux');
    });

    it('should pass through already resolved platforms', () => {
      expect(resolvePlatform('windows')).toBe('windows');
      expect(resolvePlatform('mac')).toBe('mac');
    });
  });

  describe('matchesInputShortcut (Electron before-input-event)', () => {
    const openNewWindowShortcut = shortcutDefinitions.find(
      (s) => s.id === 'openNewWindow'
    )!;
    const goBackShortcut = shortcutDefinitions.find((s) => s.id === 'goBack')!;

    it('should match Ctrl+N on Windows', () => {
      const input = {
        key: 'n',
        type: 'keyDown' as const,
        control: true,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'win32')).toBe(true);
    });

    it('should match Ctrl+N with uppercase key on Windows', () => {
      const input = {
        key: 'N',
        type: 'keyDown' as const,
        control: true,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'win32')).toBe(true);
    });

    it('should not match N without Ctrl on Windows', () => {
      const input = {
        key: 'n',
        type: 'keyDown' as const,
        control: false,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'win32')).toBe(false);
    });

    it('should not match Ctrl+N on keyUp', () => {
      const input = {
        key: 'n',
        type: 'keyUp' as const,
        control: true,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'win32')).toBe(false);
    });

    it('should match Cmd+N on Mac', () => {
      const input = {
        key: 'n',
        type: 'keyDown' as const,
        control: false,
        alt: false,
        shift: false,
        meta: true,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'darwin')).toBe(true);
    });

    it('should match Ctrl+N on Mac (alternative)', () => {
      const input = {
        key: 'n',
        type: 'keyDown' as const,
        control: true,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'darwin')).toBe(true);
    });

    it('should match Ctrl+N on Linux', () => {
      const input = {
        key: 'n',
        type: 'keyDown' as const,
        control: true,
        alt: false,
        shift: false,
        meta: false,
      };
      expect(matchesInputShortcut(input, openNewWindowShortcut, 'linux')).toBe(true);
    });

    it('should respect platform-scoped chords (meta+[ only on mac)', () => {
      const macChordInput = {
        key: '[',
        type: 'keyDown' as const,
        control: false,
        alt: false,
        shift: false,
        meta: true,
      };
      expect(matchesInputShortcut(macChordInput, goBackShortcut, 'darwin')).toBe(true);
      expect(matchesInputShortcut(macChordInput, goBackShortcut, 'windows')).toBe(false);
    });
  });

  describe('matchesKeyboardShortcut (DOM KeyboardEvent)', () => {
    const openNewWindowShortcut = shortcutDefinitions.find(
      (s) => s.id === 'openNewWindow'
    )!;

    const createKeyboardEvent = (options: {
      key: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
    }): KeyboardEvent => {
      return {
        key: options.key,
        ctrlKey: options.ctrlKey ?? false,
        metaKey: options.metaKey ?? false,
        altKey: options.altKey ?? false,
        shiftKey: options.shiftKey ?? false,
      } as KeyboardEvent;
    };

    it('should match Ctrl+N on Windows', () => {
      const event = createKeyboardEvent({ key: 'n', ctrlKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindowShortcut, 'windows')).toBe(true);
    });

    it('should match Ctrl+N with uppercase key on Windows', () => {
      const event = createKeyboardEvent({ key: 'N', ctrlKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindowShortcut, 'windows')).toBe(true);
    });

    it('should not match N without Ctrl on Windows', () => {
      const event = createKeyboardEvent({ key: 'n' });
      expect(matchesKeyboardShortcut(event, openNewWindowShortcut, 'windows')).toBe(false);
    });

    it('should match Cmd+N on Mac', () => {
      const event = createKeyboardEvent({ key: 'n', metaKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindowShortcut, 'mac')).toBe(true);
    });

    it('should not match Ctrl+Shift+N on Windows (wrong modifiers)', () => {
      const event = createKeyboardEvent({ key: 'n', ctrlKey: true, shiftKey: true });
      expect(matchesKeyboardShortcut(event, openNewWindowShortcut, 'windows')).toBe(false);
    });
  });

  describe('all shortcuts match on Windows', () => {
    // Test that all shortcuts with ctrl: true work correctly on Windows
    const ctrlShortcuts = shortcutDefinitions.filter((s) =>
      s.chords.some((c) => c.ctrl && !c.platform)
    );

    for (const shortcut of ctrlShortcuts) {
      const chord = shortcut.chords.find((c) => c.ctrl && !c.platform)!;
      it(`should match ${shortcut.id} (Ctrl+${chord.key.toUpperCase()}) on Windows`, () => {
        const input = {
          key: chord.key,
          type: 'keyDown' as const,
          control: true,
          alt: chord.alt ?? false,
          shift: chord.shift ?? false,
          meta: chord.meta ?? false,
        };
        expect(matchesInputShortcut(input, shortcut, 'win32')).toBe(true);
      });
    }
  });

  describe('formatChord', () => {
    it('should format Ctrl+N correctly on Windows', () => {
      const chord = { key: 'n', ctrl: true };
      expect(formatChord(chord, 'windows')).toBe('Ctrl+N');
    });

    it('should format Cmd+N correctly on Mac', () => {
      const chord = { key: 'n', ctrl: true };
      expect(formatChord(chord, 'mac')).toBe('Cmd+N');
    });
  });
});
