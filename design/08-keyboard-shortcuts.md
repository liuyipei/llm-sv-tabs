# Keyboard Shortcuts in Electron with WebContentsView

## Overview

Browser-style keyboard shortcuts (Ctrl+L, Ctrl+W, etc.) in Electron applications using WebContentsView require careful focus management. This document explains the architecture and key learnings from implementing global shortcuts.

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
// ❌ This doesn't work reliably:
mainWindow.focus();
mainWindow.webContents.send('focus-input');
// The UI webContents might not have focus, so element.focus() fails silently

// ✅ This works:
mainWindow.focus();                    // 1. Focus OS window
mainWindow.webContents.focus();        // 2. Focus UI webContents
setTimeout(() => {
  mainWindow.webContents.send('focus-input');  // 3. Focus element
}, 10);
```

---

## Implementation: Global Shortcuts

### Architecture Choice: `globalShortcut` vs `before-input-event`

For browser-style shortcuts (Cmd+L, Ctrl+W), use Electron's `globalShortcut` API:

**Advantages:**
- Captures shortcuts at OS level before any window receives them
- Single registration point - no per-tab setup needed
- Works regardless of which webContents currently has focus
- Matches standard browser behavior

**Alternative (`before-input-event`):**
- Would require registering handler on every WebContentsView
- More complex: needs focus management at each event
- Useful only if shortcut behavior varies per-tab

### Main Process Setup

**File:** `src/main/main.ts`

```typescript
function setupGlobalShortcuts(): void {
  // Register Cmd+L / Ctrl+L for focusing URL bar
  const focusUrlShortcut = process.platform === 'darwin' ? 'Command+L' : 'Ctrl+L';

  globalShortcut.register(focusUrlShortcut, () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return;

    // Complete focus chain: OS → UI webContents → DOM element
    mainWindow.show();                   // Ensure window is visible
    mainWindow.focus();                  // 1. Focus OS window
    mainWindow.webContents.focus();      // 2. Focus UI webContents (KEY!)

    // Small defer to let focus changes settle
    setTimeout(() => {
      mainWindow.webContents.send('focus-url-bar');
    }, 10);
  });

  // Cleanup on app quit
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
```

### Renderer Process Handler

**File:** `src/ui/components/chat/UrlBar.svelte`

```typescript
function focusUrlInputElement(): void {
  if (urlInputElement) {
    // Defer to avoid racing with webContents focus change
    setTimeout(() => {
      urlInputElement.focus();
      urlInputElement.select();
    }, 0);
  }
}

// Register IPC listener
onMount(() => {
  window.electronAPI.onFocusUrlBar(() => {
    focusUrlInputElement();
  });
});
```

### IPC Bridge

**File:** `src/main/preload.ts`

```typescript
const electronAPI = {
  onFocusUrlBar: (callback: () => void): void => {
    ipcRenderer.on('focus-url-bar', () => callback());
  },
  // ... other API methods
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

---

## Cross-Platform Considerations

### Mac: Cmd vs Ctrl

Electron's `globalShortcut` uses `Command+L` on macOS and `Ctrl+L` on Windows/Linux:

```typescript
const shortcut = process.platform === 'darwin' ? 'Command+L' : 'Ctrl+L';
```

For window-level shortcuts (if used), handle platform differences in the matcher:

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
// Main process
console.log('1. Window focused');
console.log('2. WebContents focused');
console.log('3. IPC sent');

// Renderer
console.log('4. IPC received');
console.log('5. Calling element.focus()');
console.log('6. Focus completed');
```

If you see all logs but the element doesn't focus, the issue is likely missing `webContents.focus()`.

---

## Current Shortcuts

| Shortcut | Action | Implementation |
|----------|--------|----------------|
| Cmd/Ctrl+Alt+S | Screenshot | globalShortcut → direct action |
| Cmd/Ctrl+W | Close tab | Menu accelerator → TabManager |
| Cmd/Ctrl+L | Focus URL bar | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+F | Focus search bar | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+. | Focus LLM input | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+T | New tab (focus address) | Menu accelerator → IPC |
| Cmd/Ctrl+D | Bookmark tab | Menu accelerator → IPC → bookmark sync |
| Esc | Return focus to page content | Renderer handler (fires anywhere unless already handled) → IPC → focus active WebContentsView |

**Note**: Cmd+W and Cmd+D work when the UI has focus, but not when browsing web content. To make them work globally, move them to `globalShortcut` registration following the same pattern as Cmd+L.

Renderer surfaces can explicitly return focus to the browsing context by calling `ipc.focusActiveWebContents()`. Use this when a UI overlay (URL bar, tabs, settings, find bar) wants to relinquish focus after handling a keyboard shortcut like `Esc`.

### How the `Esc` Focus Return Works (copy/paste ready)

```ts
// src/ui/App.svelte (renderer)
<svelte:window on:keydown={async (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  // blur any control-panel element, then hand off to main
  await ipc.focusActiveWebContents();
}} />

// src/ui/lib/ipc-bridge.ts (preload bridge)
focusActiveWebContents: () => window.electronAPI.focusActiveWebContents(),

// src/main/preload.ts (exposed to renderer)
focusActiveWebContents: () => ipcRenderer.invoke('focus-active-web-contents'),

// src/main/main.ts (IPC handler)
ipcMain.handle('focus-active-web-contents', () => tabManager.focusActiveWebContents());

// src/main/tab-manager.ts (focus helper)
focusActiveWebContents() {
  this.mainWindow.focus();              // OS/window focus
  this.mainWindow.webContents.focus();  // UI webContents focus
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

3. **`globalShortcut` is the right tool for browser-style shortcuts**
   - OS-level capture
   - Single registration point
   - Consistent with Electron best practices

4. **Timing matters**
   - Focus operations are asynchronous
   - Use small delays to let changes settle
   - Test on actual hardware (focus timing varies)

---

## Related Files

- `src/main/main.ts` - Global shortcut registration
- `src/main/preload.ts` - IPC bridge
- `src/ui/config/shortcuts.ts` - Window-level shortcut configuration
- `src/ui/utils/keyboard-shortcuts.ts` - Window-level shortcut handler
- `src/ui/App.svelte` - IPC listener setup
- `src/ui/components/chat/UrlBar.svelte` - Focus implementation

---

## References

- [Electron globalShortcut API](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserWindow.focus()](https://www.electronjs.org/docs/latest/api/browser-window#winfocus)
- [WebContents.focus()](https://www.electronjs.org/docs/latest/api/web-contents#contentsfocus)
