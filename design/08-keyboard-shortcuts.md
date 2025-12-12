# Keyboard Shortcuts in Electron with WebContentsView

## Overview

Browser-style keyboard shortcuts (Ctrl+L, Ctrl+W, etc.) in Electron applications using WebContentsView require careful focus management. This document explains the architecture and key learnings from implementing keyboard shortcuts.

**Key Insight**: Electron has a three-level focus hierarchy that must be managed explicitly when transferring focus between WebContentsView content and the UI.

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

## Architecture: Two-Layer Shortcut Handling

Shortcuts are handled by two complementary mechanisms:

1. **Renderer-level handlers** (`keyboard-shortcuts.ts`) - When UI panel is focused
2. **`before-input-event` handlers** (`tab-manager.ts`) - When browser content is focused

### Why Two Layers?

The application has two separate webContents:
- **UI Panel** (renderer) - Svelte app with tabs, URL bar, LLM input
- **Browser Content** (WebContentsView) - Embedded web pages

Keyboard events only go to the focused webContents. When the browser view is focused, the renderer never sees the events. The `before-input-event` handler intercepts events before they reach the page.

### Architecture Choice: `before-input-event` vs `globalShortcut`

We chose `before-input-event` over Electron's `globalShortcut` API:

**`before-input-event` (current approach):**
- Intercepts keyboard events on each WebContentsView before the page receives them
- Only active when the app window is focused (no OS-level interception)
- Requires registering handler on each view, but we centralize this in `createView()`
- More explicit: shortcuts only work within the app context

**`globalShortcut` (previous approach, now disabled):**
- Captures shortcuts at OS level before any window receives them
- Required register/unregister on window focus/blur to avoid stealing OS shortcuts
- Single registration point, but more "magical" behavior
- Code preserved in `main.ts` comments for reference if needed

---

## Implementation: Browser View Shortcuts

**File:** `src/main/tab-manager.ts`

```typescript
private setupViewKeyboardShortcuts(view: WebContentsView): void {
  const isMac = process.platform === 'darwin';

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const ctrl = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();

    // Ctrl/Cmd+L: Focus URL bar
    if (ctrl && key === 'l') {
      event.preventDefault();
      this.sendFocusEvent('focus-url-bar');
      return;
    }

    // Ctrl/Cmd+D: Bookmark current tab
    if (ctrl && key === 'd') {
      event.preventDefault();
      this.sendFocusEvent('bookmark-tab');
      return;
    }

    // ... other shortcuts
  });
}

private sendFocusEvent(eventName: string): void {
  this.mainWindow.show();
  this.mainWindow.focus();
  this.mainWindow.webContents.focus();
  setTimeout(() => {
    this.mainWindow.webContents.send(eventName);
  }, 10);
}
```

## Implementation: Renderer Shortcuts

**File:** `src/ui/utils/keyboard-shortcuts.ts`

```typescript
export function initKeyboardShortcuts(actions: ShortcutAction): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        const action = actions[shortcut.action as keyof ShortcutAction];
        if (action) action();
        break;
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
```

**File:** `src/ui/config/shortcuts.ts`

```typescript
export const shortcuts: ShortcutConfig[] = [
  // Focus shortcuts
  { key: 'l', ctrl: true, description: 'Focus URL input', action: 'focusUrlInput' },
  { key: 't', ctrl: true, description: 'New tab (focus URL bar)', action: 'focusUrlInput' },
  { key: '.', ctrl: true, description: 'Focus LLM input', action: 'focusLLMInput' },
  // Tab management
  { key: 'w', ctrl: true, description: 'Close active tab', action: 'closeActiveTab' },
  { key: 'd', ctrl: true, description: 'Bookmark current tab', action: 'bookmarkActiveTab' },
  { key: 'r', ctrl: true, description: 'Reload current tab', action: 'reloadActiveTab' },
  { key: 'f', ctrl: true, description: 'Find in page', action: 'toggleSearchBar' },
  // Screenshot
  { key: 's', ctrl: true, alt: true, description: 'Capture screenshot', action: 'triggerScreenshot' },
  // Navigation
  { key: 'ArrowLeft', alt: true, description: 'Go back', action: 'goBack' },
  { key: 'ArrowRight', alt: true, description: 'Go forward', action: 'goForward' },
  // Tab switching
  { key: 'Tab', ctrl: true, description: 'Next tab', action: 'nextTab' },
  { key: 'Tab', ctrl: true, shift: true, description: 'Previous tab', action: 'previousTab' },
];
```

---

## IPC Bridge

**File:** `src/main/preload.ts`

```typescript
const electronAPI = {
  onFocusUrlBar: (callback: () => void): void => {
    ipcRenderer.on('focus-url-bar', () => callback());
  },
  onFocusSearchBar: (callback: () => void): void => {
    ipcRenderer.on('focus-search-bar', () => callback());
  },
  onFocusLLMInput: (callback: () => void): void => {
    ipcRenderer.on('focus-llm-input', () => callback());
  },
  onBookmarkTab: (callback: () => void): void => {
    ipcRenderer.on('bookmark-tab', () => callback());
  },
  onNavigateNextTab: (callback: () => void): void => {
    ipcRenderer.on('navigate-next-tab', () => callback());
  },
  onNavigatePreviousTab: (callback: () => void): void => {
    ipcRenderer.on('navigate-previous-tab', () => callback());
  },
  onTriggerScreenshot: (callback: () => void): void => {
    ipcRenderer.on('trigger-screenshot', () => callback());
  },
};
```

---

## Cross-Platform Considerations

### Mac: Cmd vs Ctrl

In `before-input-event`, check for the appropriate modifier:

```typescript
const isMac = process.platform === 'darwin';
const ctrl = isMac ? input.meta : input.control;
```

In renderer keyboard handlers:

```typescript
const isMac = navigator.platform.toLowerCase().includes('mac');
const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
```

---

## Timing Considerations

### Why setTimeout is Needed

1. **Main Process (10ms delay)**:
   - Allows `mainWindow.focus()` and `webContents.focus()` to complete
   - OS-level focus changes are asynchronous

2. **Renderer Process (0ms / next tick)**:
   - Ensures webContents focus has settled before calling `element.focus()`
   - Avoids race condition where element.focus() runs before webContents has focus

### Testing Focus Issues

If shortcuts aren't working, add logging at each level:

```typescript
// Main process (before-input-event)
console.log('1. Shortcut intercepted');
console.log('2. Focus chain started');
console.log('3. IPC sent');

// Renderer
console.log('4. IPC received');
console.log('5. Calling element.focus()');
console.log('6. Focus completed');
```

---

## Current Shortcuts

All shortcuts are handled in both locations for complete coverage:

| Shortcut | Action | Browser View Handler | Renderer Handler |
|----------|--------|---------------------|------------------|
| Cmd/Ctrl+L | Focus URL bar | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+T | New tab (focus URL) | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+. | Focus LLM input | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+W | Close tab | `before-input-event` → TabManager | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+D | Bookmark tab | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+R | Reload tab | `before-input-event` → TabManager | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+F | Focus search bar | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd/Ctrl+Alt+S | Screenshot | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Alt+Left | Go back | `before-input-event` → TabManager | `keyboard-shortcuts.ts` |
| Alt+Right | Go forward | `before-input-event` → TabManager | `keyboard-shortcuts.ts` |
| Ctrl+Tab | Next tab | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Ctrl+Shift+Tab | Previous tab | `before-input-event` → IPC | `keyboard-shortcuts.ts` |
| Cmd+[ | Go back (Mac) | `before-input-event` → TabManager | (Mac-specific) |
| Cmd+] | Go forward (Mac) | `before-input-event` → TabManager | (Mac-specific) |
| Cmd+Alt+Right | Next tab (Mac) | `before-input-event` → IPC | (Mac-specific) |
| Cmd+Alt+Left | Previous tab (Mac) | `before-input-event` → IPC | (Mac-specific) |
| Esc | Return focus to page | (not needed) | `App.svelte` → IPC |

### How the `Esc` Focus Return Works

```ts
// src/ui/App.svelte (renderer)
<svelte:window on:keydown={async (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  await ipc.focusActiveWebContents();
}} />

// src/main/tab-manager.ts (focus helper)
focusActiveWebContents() {
  this.mainWindow.focus();
  this.mainWindow.webContents.focus();
  this.activeWebContentsView.webContents.focus(); // page content focus
}
```

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

- `src/main/tab-manager.ts` - `before-input-event` handlers for browser views
- `src/main/main.ts` - Disabled global shortcuts (preserved for reference)
- `src/main/preload.ts` - IPC bridge for shortcut events
- `src/ui/config/shortcuts.ts` - Renderer shortcut configuration
- `src/ui/utils/keyboard-shortcuts.ts` - Renderer shortcut handler
- `src/ui/App.svelte` - IPC listener setup and Escape handler

---

## References

- [Electron before-input-event](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserWindow.focus()](https://www.electronjs.org/docs/latest/api/browser-window#winfocus)
- [WebContents.focus()](https://www.electronjs.org/docs/latest/api/web-contents#contentsfocus)
