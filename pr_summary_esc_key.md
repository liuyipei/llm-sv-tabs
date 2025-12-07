# Escape Shortcut Focus Summary

## What Changed
- Added a global `Esc` handler in `src/ui/App.svelte` that blurs the active control (URL bar, search bar, settings panes, etc.) and requests focus for the active `WebContentsView` whenever `Esc` is pressed and not already handled elsewhere.
- Introduced an IPC focus pathway (`focusActiveWebContents`) exposed through `src/main/preload.ts`, handled in `src/main/main.ts`, and implemented in `src/main/tab-manager.ts` to cascade focus from the window to the UI webContents and finally to the active page view.
- Updated shortcut references (`KEYBOARD_SHORTCUTS.md`, `design/08-keyboard-shortcuts.md`) to describe the renderer-handled `Esc` behavior and provide a copy/paste walkthrough of the routing path.

## How `Esc` is Routed (high level)
1. **Renderer capture** (`src/ui/App.svelte`): listens for `keydown` at the window level, ignores prevented events, prevents default for `Esc`, blurs the active element, and invokes `ipc.focusActiveWebContents()`.
2. **Preload bridge** (`src/main/preload.ts` & `src/ui/lib/ipc-bridge.ts`): exposes `focusActiveWebContents` to the renderer and IPC bridge, forwarding the invocation to the main process.
3. **Main process handler** (`src/main/main.ts`): handles the `focus-active-web-contents` IPC request and delegates to `TabManager`.
4. **Focus helper** (`src/main/tab-manager.ts`): ensures the window and UI webContents are focused before focusing the active tab’s `WebContentsView`, returning structured success/error info so callers can warn on failures.
5. **UI overlays** (`src/ui/components/chat/SearchBar.svelte`): close actions also call `focusActiveWebContents()` so leaving the overlay returns focus to the page.

## Rationale & Insights
- **Consistent fallback**: Handling `Esc` in the renderer avoids menu accelerators stealing focus and works even when control-panel elements own focus; it also respects `event.defaultPrevented` so feature-specific handlers can override it.
- **Multi-layer focus**: Successful page focus requires the window, UI webContents, and `WebContentsView` to be focused in order; the helper sequences these steps and reports failures for debugging.
- **Docs for handoff**: Shortcut docs now point out that `Esc` is renderer-driven and include a code-path snippet so front-end engineers know how to request page focus or extend the behavior.

## Open Considerations
- If future shortcuts need to relinquish focus, re-use `ipc.focusActiveWebContents()` from the renderer side to maintain consistent focus behavior.
- If a focus request returns `{ success: false }`, the warning logs in the renderer/main should surface enough detail to diagnose whether the tab was missing or a WebContents was destroyed.
