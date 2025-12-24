# Flexible Tab System (content types, rendering, and lifecycle)

This document summarizes how tabs are represented, created, rendered, and persisted. Window ownership, focus, and per-window activation rules are detailed in [Design 14: Multi-Window Tab Registry](./14-multi-window-tab-registry.md).

## Tab model at a glance

- **Types:** `'webpage' | 'pdf' | 'notes' | 'upload'`, with optional `component` hints (`'llm-response' | 'note' | 'api-key-instructions' | 'aggregate-tabs'`) for renderer-driven tabs.【F:src/types.ts†L11-L90】
- **Ownership and state:** The main-process `TabManager` is authoritative for every tab object (`Map<string, TabWithView>`) and delegates `tabId -> windowId` ownership to the `WindowRegistry` so each tab lives in exactly one window at a time.【F:src/main/tab-manager.ts†L15-L83】【F:src/main/tab-manager/window-registry.ts†L18-L112】
- **Renderer view:** Each renderer mirrors only its window’s tabs through IPC (`tab-created`, `tab-updated`, `tab-closed`, `active-tab-changed`, navigation state). Renderer state lives in Svelte stores (`activeTabs`, `activeTabId`, etc.), and all mutations are requested over IPC (`openUrl`, `closeTab`, `setActiveTab`, navigation).【F:src/ui/lib/ipc-bridge.ts†L81-L200】【F:src/ui/stores/tabs.ts†L1-L156】
- **URL schemes and metadata:** Web tabs keep real URLs; note/file tabs use `note://` identifiers with `metadata.fileType/filePath`; LLM tabs use `llm-response://` plus rich metadata for streaming and tokens; aggregate tabs use `aggregate-tabs://<windowId>` with lightweight metadata for renderer-driven rendering.【F:src/main/tab-manager.ts†L314-L420】【F:src/main/tab-manager/llm-tab-service.ts†L20-L198】【F:src/main/tab-manager/aggregate-tab-service.ts†L15-L70】

## Rendering strategies

- **WebContentsView-backed:** Web pages and file-based tabs that need Chromium rendering (PDFs, images, other uploads) attach a `WebContentsView` created with window-scoped keyboard shortcuts and dynamically sized to sit beside the sidebar/header/search UI.【F:src/main/tab-manager.ts†L90-L235】【F:src/main/tab-manager.ts†L314-L420】
- **Svelte component-backed:** Text notes, LLM responses, and helper tabs (API key instructions) set `component` and omit `view`; the renderer swaps the matching Svelte component into the content area when active.【F:src/main/tab-manager/note-tab-service.ts†L22-L123】【F:src/main/tab-manager/llm-tab-service.ts†L20-L198】【F:src/main/tab-manager.ts†L430-L477】

## Tab types and how they are created

- **Web pages** (`type: 'webpage'`, `view` present)  
  - Created via `openUrl`. The `TabManager` wires title, URL changes, navigation state, and favicons back to the owning window via IPC. Load errors are surfaced with `tab-load-error` and stored on the tab.【F:src/main/tab-manager.ts†L314-L420】
  - Navigation commands (`goBack`, `goForward`, `reload`) are delegated to the `NavigationService`.【F:src/main/tab-manager.ts†L548-L584】

- **Text notes** (`type: 'notes'`, `component: 'note'`)  
  - Created by `NoteTabService.openNoteTab` for ad-hoc notes or text uploads/bookmarks. Content is stored in metadata (`noteContent`, `noteId`, optional `filePath`) and rendered purely in the renderer.【F:src/main/tab-manager/note-tab-service.ts†L22-L123】

- **PDFs and images** (`type: 'notes'` with `fileType: 'pdf' | 'image'`)  
  - Use `WebContentsView` plus `tempFileService.writeToTempFile` to avoid data-URL limits. Metadata captures `filePath`, `mimeType`, and `imageData` for extraction and reload. Missing files are shown with an inline error view during restore.【F:src/main/tab-manager/note-tab-service.ts†L39-L132】【F:src/main/tab-manager/session-persistence-service.ts†L120-L214】

- **LLM responses** (`type: 'notes'`, `component: 'llm-response'`)  
  - Created by `LLMTabService.openLLMResponseTab`; all content lives in metadata (`isLLMResponse`, `response`, `query`, tokens, identifiers). Streaming updates are throttled to keep renderer stores in sync. A raw-message helper view can be opened as an auxiliary `WebContentsView` tab.【F:src/main/tab-manager/llm-tab-service.ts†L20-L198】【F:src/main/tab-manager.ts†L890-L931】

- **Helper component tabs** (`component: 'api-key-instructions'`)  
  - Renderer-only Svelte tabs with no `WebContentsView`, intentionally excluded from persistence and session restore.【F:src/main/tab-manager.ts†L430-L477】【F:src/main/tab-manager/session-persistence-service.ts†L21-L83】

### Aggregate “browser multitabs” (new component-backed tab)

- **Purpose:** A single tab per window that visualizes all tabs across all windows, grouped by window, with per-tab icons that reflect type (webpage, note, PDF, image, conversation, other uploads). Designed to be Svelte-rendered (no `WebContentsView`) for easy UI iteration and cross-window consistency.
- **Creation/placement:** Choose the lower-complexity path—spawn the tab when the user clicks the aggregate button, enforce at most one per window, and let the user close it. Pinning/always-first rules would add ordering edge cases across windows, so we defer that to keep implementation simple and consistent with existing tab ordering.
- **Data source:** Use the registry’s aggregated snapshot (window list + tab list) to render the tree; rely on stable `tabId` values from the registry to target actions and keep cross-window actions deterministic.
- **Close behavior:** Delegate tab closure actions to the existing `closeTab(tabId)` flow so ownership cleanup, temp-file cleanup, and session persistence rules remain consistent.
- **Extensibility and live updates:** Start with minimal fields (icon + title per tab, where the icon is derived from tab type); keep the layout ready to add active markers, window IDs, last-viewed timestamps, or other computed attributes. The view should update in real time as the registry snapshot changes (new/closed/moved tabs or ownership changes).

### IPC entry points and renderer wiring

- **Creation and mutation:** Renderers invoke `open-url`, `open-note-tab`, `open-llm-response-tab`, `open-aggregate-tab`, `close-tab`, `set-active-tab`, navigation commands, and content updates (note/LLM) through the IPC bridge; `WindowRegistry` is used to route requests to the correct window context.【F:src/main/ipc/handlers/tab-handlers.ts†L27-L125】【F:src/ui/lib/ipc-bridge.ts†L24-L160】
- **Events:** `tab-created`, `tab-updated`, `tab-closed`, `tab-title-updated`, `tab-url-updated`, `active-tab-changed`, navigation state, favicon updates, and load errors drive renderer store updates. Aggregate tabs rely on `get-tab-registry-snapshot` for cross-window context and refresh on these events.【F:src/main/preload.ts†L144-L189】【F:src/ui/lib/ipc-bridge.ts†L84-L135】【F:src/ui/components/tabs/AggregateTabs.svelte†L14-L82】

## Persistence and restoration (per-session)

- `SessionPersistenceService` filters out ephemeral tabs (API key instructions, raw-message helpers, uploads without `filePath`) and strips large binaries before writing to disk.【F:src/main/tab-manager/session-persistence-service.ts†L21-L83】
- Restore flow recreates tabs by type/component: webpages reload their URL; text notes rebuild metadata-only tabs; PDFs/images reload from disk or render an inline error; LLM tabs rebuild metadata and resume in a non-streaming state.【F:src/main/tab-manager/session-persistence-service.ts†L90-L214】

## Multi-window notes (summary)

- Ownership (`tabId -> windowId`) and activation are managed centrally by `WindowRegistry`; `setActiveTab` detaches any prior view for that window, attaches the new one, and targets updates to the owning renderer. Keyboard shortcuts inside `WebContentsView` are routed through the registry so they act on the correct window. See Design 14 for full lifecycle and aggregated snapshot behavior.【F:src/main/tab-manager.ts†L545-L739】【F:src/main/tab-manager/window-registry.ts†L18-L112】
