# Multi-Window Tab Registry and Window Controllers

## Goals

- Make the main process the authoritative source of truth for every tab across multiple `BrowserWindow` instances.
- Allow each window to have its own active tab, layout state, and keyboard handling without duplicating tab management logic.
- Provide the data model needed for a global aggregated view that can list, activate, and move tabs across windows.
- Keep renderer processes “dumb”: they render what the main process tells them and request mutations via IPC.

## Architecture (Option A)

- **Tab Registry (main process)**
  - Owns the global tab map (`tabId -> TabWithView`) and window ownership map (`tabId -> windowId`).
  - Generates tab IDs and tracks window descriptors (`windowId -> { BrowserWindow, activeTabId, activeWebContentsView, isSearchBarVisible }`).
  - Provides helper queries for per-window tab lists (`getActiveTabs(windowId)`) and aggregated snapshots (`getWindowSnapshots()`), matching the current `TabManager` and `WindowRegistry` APIs.
  - Sends renderer updates to the window that owns the tab (or to the primary window for window-agnostic events).

- **Window Controllers (per BrowserWindow)**
  - Handle layout for the active `WebContentsView` (sidebar/header offsets, search bar visibility).
  - Manage focus routing for keyboard shortcuts and UI focus events.
  - Clean up view attachments on window close.

- **Tab Services (LLM, navigation, find-in-page, notes, session persistence)**
  - Remain pluggable and stateless with respect to window ownership; they delegate window-aware work back to the registry.
  - Receive factories (createTabId, createView(windowId), sendToRenderer, setActiveTab(tabId, windowId)) so they can work with multi-window contexts.

## Data Flows

### Opening a tab
1. Renderer invokes `open-url` (or note/LLM/bookmark open) over IPC.
2. Handler resolves `windowId` from `event.sender` and calls `openUrl(url, autoSelect=true, windowId)`.
3. Registry creates the view with window-scoped keyboard shortcuts, maps `tabId -> windowId`, and attaches the view to that window’s `contentView` on activation.
4. Renderer receives `tab-created` targeted to the owning window.

### Activation and focus
- Each window tracks its own `activeTabId` and `activeWebContentsView`.
- Activating a tab detaches the previous view for that window, attaches the new view, updates bounds, and sends `active-tab-changed` to that window.
- Focus helpers (`focus-url-bar`, search, LLM input) target the correct window so shortcuts remain local.

### Per-window navigation and tab switching
- `next-tab` / `previous-tab` now operate on the requesting window’s tab list.
- Navigation state events (`navigation-state-updated`) are routed to the owning window of the tab.

### Session persistence
- Session files now include per-window metadata: `[{ windowId, activeTabId, tabIds[] }, ...]` in addition to the persisted tabs.
- Restore flow maps persisted tab IDs to new IDs and reassigns them to the recorded window when available; falls back to the primary window when necessary.

### Screenshot and bookmarks
- Screenshot-captured tabs and bookmarks open in the window that initiated the IPC call, preserving user intent in multi-window sessions.

## Renderer Responsibilities

- Render only the tabs provided by `get-active-tabs` for the current window.
- Continue to request mutations via IPC; avoid maintaining any cross-window state in the renderer.
- Prepare to consume an upcoming “global tab list” IPC for the aggregated view (not yet implemented here).

## Aggregated View (forward-looking)

- The registry already provides the primitives to surface `{ windows: [{ id, activeTabId, tabIds }], tabs: TabData[] }` for a global tab picker/mover or the component-backed “aggregate browser multitabs” UI described in Design 03.
- Moving a tab will be implemented by detaching its `WebContentsView` from the source window and re-attaching it to the destination, then updating `tabId -> windowId` ownership. Closing a tab from the aggregate view should call the existing `closeTab(tabId)` to keep cleanup consistent.
- Activation commands from the aggregated view will focus the destination window before raising the tab. Stable `tabId` values from the registry should be used for all cross-window actions, and renderer consumers should be ready to refresh on snapshot changes to keep the aggregate UI live (via `get-tab-registry-snapshot` IPC or equivalent).

## Testing and Operational Considerations

- Window-aware IPC relies on `event.sender`; ensure preload/bridge usage stays per-window.
- When a window closes, its active view is detached and tab ownership entries are cleaned up. Future enhancements can decide whether to close or reassign those tabs.
- Session schema changes remain backward compatible: legacy sessions without `windows` still restore into the primary window, using the old `activeTabId` as a hint.
