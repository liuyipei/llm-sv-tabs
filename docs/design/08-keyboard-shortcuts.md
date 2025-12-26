# Keyboard Shortcuts in Electron with WebContentsView

## Overview

Browser-style keyboard shortcuts (Ctrl+L, Ctrl+W, etc.) in Electron applications using WebContentsView require careful focus management *and* a single source of truth so Windows/Linux and macOS mappings stay aligned. This document captures the shared registry, how both processes consume it, and how we surface the live list in the UI.

**Key Insight**: Electron has a three-level focus hierarchy that must be managed explicitly when transferring focus between WebContentsView content and the UI. We now combine that with a canonical shortcut registry to avoid drift between platforms, handlers, and documentation.

---

## Application Menu Null Architecture

We use `Menu.setApplicationMenu(null)` to disable Electron's default menu entirely. This gives us full control over keyboard shortcuts without interference from Electron's menu accelerators.

### Why disable the default menu?

1. **Menu accelerators are unreliable**: On Windows, menu accelerators (like `Ctrl+N`) don't trigger when focus is inside a webContents (renderer or WebContentsView). The key is captured but nothing happens.

2. **Unified control**: By handling all shortcuts ourselves, we ensure consistent behavior regardless of where focus is in the app.

3. **Simpler mental model**: Two layers (renderer + WebContentsView), one registry, no menu accelerator surprises.

### Why not use `globalShortcut`?

- Intercepts keys **system-wide**, even when the app is not focused
- Can interfere with other applications using the same shortcuts
- Anti-pattern for desktop apps - users don't expect your app to steal global keys

### Our three-layer approach

```
┌─────────────────────────────────────────────────────────────┐
│                    BrowserWindow                            │
│  ┌───────────────────────┬───────────────────────────────┐  │
│  │   Main webContents    │      WebContentsView          │  │
│  │   (Svelte UI)         │      (Browser content)        │  │
│  │                       │                               │  │
│  │   Layer 1: DOM        │   Layer 3:                    │  │
│  │   window.keydown      │   before-input-event          │  │
│  │                       │                               │  │
│  │   Layer 2: Main       │                               │  │
│  │   before-input-event  │                               │  │
│  │                       │                               │  │
│  └───────────────────────┴───────────────────────────────┘  │
│                                                             │
│  All layers import from src/shared/keyboard-shortcuts.ts    │
└─────────────────────────────────────────────────────────────┘
```

- **Layer 1 (Renderer DOM)**: `src/ui/utils/keyboard-shortcuts.ts` - handles shortcuts via DOM keydown when Svelte UI has focus
- **Layer 2 (Main window webContents)**: `src/main/services/window-factory.ts` - handles shortcuts via `before-input-event` on the main window's webContents (backup for Layer 1 on Windows)
- **Layer 3 (WebContentsView)**: `src/main/tab-manager.ts` - handles shortcuts via `before-input-event` when browser content has focus

All layers use the same definitions from `src/shared/keyboard-shortcuts.ts`.

**Why Layer 2?** On Windows, DOM keyboard events in the renderer may not fire reliably for certain shortcuts like Ctrl+N. Layer 2 provides a fallback by intercepting keyboard input at the main process level before it reaches the DOM.

---

## Canonical shortcut registry

All shortcut definitions live in `src/shared/keyboard-shortcuts.ts`. Each entry contains an action id, a category, and one or more platform-aware chords. The same data powers the renderer, main process, and UI help surface.

```typescript
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
    id: 'triggerScreenshot',
    description: 'Capture screenshot',
    category: 'Actions',
    chords: [{ key: 's', ctrl: true, alt: true }],
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
  // ...
];
```

Supporting helpers keep platform rules consistent:
- `resolvePlatform()` normalizes Windows/Linux/macOS detection for both renderer and main.
- `matchesKeyboardShortcut()` and `matchesInputShortcut()` convert `Ctrl → Cmd` on macOS (while still respecting a physical Ctrl key) and ensure extra modifiers don’t leak through.
- `formatShortcut()` and `formatChord()` render platform-aware labels (Ctrl/Cmd, Alt/Option, Meta/Win).

---

## Where the registry is consumed

- **Renderer key handling (`src/ui/utils/keyboard-shortcuts.ts`)**
  Iterates `shortcutDefinitions`, calls `matchesKeyboardShortcut`, and dispatches to the action map. No duplicate per-platform lists are required.

- **Main window webContents (`src/main/services/window-factory.ts`)**
  Uses `before-input-event` on each BrowserWindow's webContents to handle Ctrl+N when the Svelte UI has focus. This is a fallback for Windows where DOM events may not fire reliably.

- **WebContentsView handling (`src/main/tab-manager.ts`)**
  Uses the same definitions with `matchesInputShortcut` inside `before-input-event`, so browser-focused content honors the same chords as the UI panel. Action handlers (close tab, navigate, bookmark, screenshot, etc.) are keyed by the shared action id.

- **UI help surface (`src/ui/components/common/KeyboardShortcutsPanel.svelte`)**
  Renders the live registry grouped by category. The panel is reachable from the sidebar and always reflects the runtime config, including platform-specific alternates like `Cmd+Option+Left/Right` for tab switching on macOS.

- **Documentation (`design/08-keyboard-shortcuts.md`)**
  This document references the shared registry and explains how mappings are generated; no separate markdown file is needed.

---

## The Focus Hierarchy

When working with BrowserWindow and WebContentsView, there are three distinct levels of focus:

1. **OS Window Focus**: `BrowserWindow.focus()`
   - Makes the window active at the operating system level

2. **WebContents Focus**: `webContents.focus()`
   - Determines which renderer process has focus within the window
   - **Critical**: A window can be focused while the wrong webContents has focus

3. **DOM Element Focus**: `element.focus()`
   - Focuses a specific input/element within the focused webContents
   - Only works if the parent webContents already has focus

### Common Pitfall

```typescript
// This doesn't work reliably:
mainWindow.focus();
mainWindow.webContents.send('focus-input');
// The UI webContents might not have focus, so element.focus() fails silently

// This works:
mainWindow.focus();                    // 1. Focus OS window
mainWindow.webContents.focus();        // 2. Focus UI webContents
setTimeout(() => {
  mainWindow.webContents.send('focus-input');  // 3. Focus element
}, 10);
```

---

## Architecture: Three-layer handling, one registry

Shortcuts flow through three layers: renderer DOM handlers, main process handlers for the BrowserWindow's webContents, and `before-input-event` handlers for WebContentsViews. All layers import the same registry and helpers, so platform translation (`Ctrl → Cmd`, `Alt → Option`, meta handling) and the set of actions cannot drift.

The default Electron menu is disabled via `Menu.setApplicationMenu(null)` in `src/main/main.ts`. See "Application Menu Null Architecture" above for rationale.

---

## UI and documentation surfaces

- **Help panel**: The sidebar’s ⌨️ view renders `shortcutDefinitions` grouped by category with platform-aware labels.
- **Docs**: Tables in this document are derived from the canonical registry (Windows/Linux vs macOS columns) and point back to `src/shared/keyboard-shortcuts.ts`.

These surfaces ensure engineers and users see the same chords the runtime enforces.

### Timing considerations

- **Main process (10ms delay in `sendFocusEvent`)**: lets `BrowserWindow.focus()` and `webContents.focus()` settle before IPC targets elements.
- **Renderer**: call `element.focus()` only after confirming the UI webContents is focused.

If shortcuts stop working, log each step (intercepted → focus chain → IPC → renderer focus) to spot which hop failed.

---

## Current shortcuts and platform mapping

The source of truth is `src/shared/keyboard-shortcuts.ts`. Both the renderer and `before-input-event` listeners import that registry, and the ⌨️ sidebar view renders it for users. The tables below are derived directly from the registry.

### Focus and search

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Focus URL bar | `Ctrl+L` | `Cmd+L` |
| Open new tab (focus URL bar) | `Ctrl+T` | `Cmd+T` |
| Focus LLM input | `Ctrl+.` | `Cmd+.` |
| Find in page | `Ctrl+F` | `Cmd+F` |

### Tab and window management

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Next tab | `Ctrl+Tab` | `Ctrl+Tab` or `Cmd+Option+Right` |
| Previous tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` or `Cmd+Option+Left` |
| Close active tab | `Ctrl+W` | `Cmd+W` |
| Open new window | `Ctrl+N` | `Cmd+N` |

### Navigation and actions

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Go back | `Alt+Left` | `Alt+Left` or `Cmd+[` |
| Go forward | `Alt+Right` | `Alt+Right` or `Cmd+]` |
| Reload current tab | `Ctrl+R` | `Cmd+R` |
| Bookmark current tab | `Ctrl+D` | `Cmd+D` |
| Capture screenshot | `Ctrl+Alt+S` | `Cmd+Option+S` |

---

## Key Learnings

1. **WebContentsView creates multiple focus contexts**
   - Main window's webContents (UI)
   - Each WebContentsView's webContents (web pages)
   - Only one can have focus at a time

2. **`element.focus()` fails silently**
   - No error is thrown
   - Element simply doesn't receive focus
   - Always ensure parent webContents has focus first

3. **`before-input-event` is preferred for app-scoped shortcuts**
   - Only intercepts when app is focused
   - No need for focus/blur registration dance
   - More predictable behavior

4. **Timing matters**
   - Focus operations are asynchronous
   - Use small delays to let changes settle
   - Test on actual hardware (focus timing varies)

---

## Related Files

- `src/shared/keyboard-shortcuts.ts` - Canonical registry and helpers
- `src/main/tab-manager.ts` - `before-input-event` handlers for browser views (Layer 2)
- `src/main/main.ts` - `disableDefaultMenu()` and architecture documentation
- `src/main/preload.ts` - IPC bridge for shortcut events
- `src/ui/utils/keyboard-shortcuts.ts` - Renderer shortcut handler (Layer 1)
- `src/ui/components/common/KeyboardShortcutsPanel.svelte` - Live shortcut help panel
- `src/ui/App.svelte` - IPC listener setup and Escape handler

---

## References

- [Electron before-input-event](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserWindow.focus()](https://www.electronjs.org/docs/latest/api/browser-window#winfocus)
- [WebContents.focus()](https://www.electronjs.org/docs/latest/api/web-contents#contentsfocus)
