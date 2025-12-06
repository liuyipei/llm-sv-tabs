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

## Implementation: Menu Accelerators

### Architecture Choice: `Menu` accelerators (Recommended)

For browser-style shortcuts (Cmd+L, Ctrl+W), use Electron's `Menu` module with accelerators:

**Advantages:**
- Works at the application window level (not system-wide)
- Only triggers when the app is focused (doesn't capture input from other apps)
- Works regardless of whether focus is on mainWindow UI or WebContentsView
- Single registration point - no per-tab setup needed
- Standard Electron pattern for application shortcuts

**Why NOT `globalShortcut`:**
- Captures shortcuts at OS level even when app is not focused
- Would intercept Ctrl+F in Chrome, Ctrl+W in other apps, etc.
- Requires focus/blur handlers to register/unregister dynamically

**Why NOT `before-input-event`:**
- Only fires on the webContents that has focus
- Would require registering handler on every WebContentsView
- More complex: needs focus management at each event

### Main Process Setup

**File:** `src/main/main.ts`

```typescript
function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Focus URL Bar',
          accelerator: 'CmdOrControl+L',
          click: (): void => {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) return;

            mainWindow.webContents.focus();
            setTimeout(() => {
              mainWindow.webContents.send('focus-url-bar');
            }, 10);
          },
        },
        // ... other menu items
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

Menu accelerators use `CmdOrControl` for cross-platform shortcuts:

```typescript
accelerator: 'CmdOrControl+L'  // Uses Cmd on macOS, Ctrl on Windows/Linux
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
| Cmd/Ctrl+L | Focus URL bar | Menu accelerator → IPC → focus element |
| Cmd/Ctrl+F | Find | Menu accelerator → IPC → focus search bar |
| Cmd/Ctrl+T | New Tab | Menu accelerator → IPC → focus URL bar |
| Cmd/Ctrl+W | Close Tab | Menu accelerator → close active tab |
| Cmd/Ctrl+R | Reload | Menu accelerator → reload active tab |
| Cmd/Ctrl+Alt+S | Screenshot | Menu accelerator → capture screenshot |
| Alt+Left/Right | Back/Forward | Menu accelerator → navigate |
| Ctrl+Tab | Next Tab | Menu accelerator → switch tab |

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

3. **`Menu` accelerators are the right tool for browser-style shortcuts**
   - Works at application window level (not system-wide)
   - Only triggers when app is focused
   - Works regardless of which webContents has focus
   - Consistent with Electron best practices

4. **Avoid `globalShortcut` for standard app commands**
   - Captures shortcuts system-wide, even when app is not focused
   - Would intercept Ctrl+F in Chrome, Ctrl+W in other apps
   - Only use for truly global shortcuts (e.g., system-wide hotkeys)

5. **Timing matters**
   - Focus operations are asynchronous
   - Use small delays to let changes settle
   - Test on actual hardware (focus timing varies)

---

## Related Files

- `src/main/main.ts` - Application menu with accelerators
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
