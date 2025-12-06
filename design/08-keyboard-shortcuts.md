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

### Architecture Choice: App Menu Accelerators vs `before-input-event`

For browser-style shortcuts (Cmd+L, Ctrl+W), prefer Electron's **Menu accelerators** defined in the main process:

**Advantages (Menu Accelerators):**
- Keystrokes are only captured when the app window is active (no background interception in Chrome, etc.)
- Still bypasses the WebContentsView focus issue—accelerators fire at the application window level
- Single registration point (Menu template) with automatic cleanup when the menu is replaced
- Works consistently on macOS and Windows without per-view listeners

**Why not `globalShortcut` here?**
- `globalShortcut` captures at the OS level even when the app is unfocused, stealing shortcuts from other apps
- It also requires manual unregistering to avoid leaks

**Alternative (`before-input-event`):**
- Would require registering handler on every WebContentsView
- More complex: needs focus management at each event
- Useful only if shortcut behavior varies per-tab

### Main Process Setup

**File:** `src/main/main.ts`

```typescript
function createApplicationMenu(): void {
  const template = [
    {
      label: 'View',
      submenu: [
        // Works even when a WebContentsView is focused
        { label: 'Focus Address Bar', accelerator: focusUrlShortcut, click: focusUrlBar },
        { label: 'Find in Page', accelerator: findShortcut, click: focusSearchBar },
        { label: 'Screenshot', accelerator: screenshotShortcut, click: captureScreenshot },
      ],
    },
    // ...navigation + file menus
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

All focus-related accelerators (`Cmd/Ctrl+L`, `Cmd/Ctrl+F`, `Cmd/Ctrl+.`) call the same `focusMainUI()` helper before emitting
their IPC events, so they behave consistently whether the UI webContents or a `WebContentsView` owns focus.

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

Use Electron's `CommandOrControl` accelerator token so macOS receives `Cmd` while Windows/Linux receive `Ctrl` without having to branch manually:

```typescript
const shortcut = 'CommandOrControl+L';
```

For window-level shortcuts (if used), handle platform differences in the matcher:

```typescript
const isMac = navigator.platform.toLowerCase().includes('mac');
const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
```

### Avoiding Listener Leaks

Register menu accelerators and session-level listeners once during `app.whenReady()` (or guard with a boolean) so they don't accumulate when re-creating the main window on macOS.

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
| Cmd/Ctrl+L | Focus URL bar | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+F | Focus search bar | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+. | Focus LLM input | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+Alt+S | Screenshot | Menu accelerator → screenshot service |
| Cmd/Ctrl+W | Close tab | Menu accelerator → TabManager |
| Cmd/Ctrl+T | New tab (focus address) | Menu accelerator → IPC |
| Cmd/Ctrl+D | Bookmark tab | Menu accelerator → IPC → bookmark sync |
| Esc | Return focus to page content | Renderer handler (fires anywhere unless already handled) → IPC → focus active WebContentsView |

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

**Note**: Accelerators fire at the application window level, so they work inside `WebContentsView` without stealing shortcuts when the window is unfocused. Use `globalShortcut` only for truly background behaviors.

Renderer surfaces can explicitly return focus to the browsing context by calling `ipc.focusActiveWebContents()`. Use this when a UI overlay (URL bar, tabs, settings, find bar) wants to relinquish focus after handling a keyboard shortcut like `Esc`.

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

3. **Menu accelerators are preferred for browser-style shortcuts**
   - Avoid background capture while still bypassing WebContentsView focus
   - Single registration point via the menu template
   - Consistent with Electron best practices for app-scoped commands

4. **Timing matters**
   - Focus operations are asynchronous
   - Use small delays to let changes settle
   - Test on actual hardware (focus timing varies)

---

## Related Files

- `src/main/main.ts` - Application menu accelerators and IPC bridge
- `src/main/preload.ts` - IPC bridge
- `src/ui/config/shortcuts.ts` - Window-level shortcut configuration
- `src/ui/utils/keyboard-shortcuts.ts` - Window-level shortcut handler
- `src/ui/App.svelte` - IPC listener setup
- `src/ui/components/chat/UrlBar.svelte` - Focus implementation

---

## References

- [Electron Menu API](https://www.electronjs.org/docs/latest/api/menu)
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [BrowserWindow.focus()](https://www.electronjs.org/docs/latest/api/browser-window#winfocus)
- [WebContents.focus()](https://www.electronjs.org/docs/latest/api/web-contents#contentsfocus)
