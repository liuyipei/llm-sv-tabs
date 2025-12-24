# Retrospective Resource & Lifecycle Audit

**Project:** llm-sv-tabs (Electron + Svelte 5 Multi-Tab Browser)
**Date:** 2025-12-24
**Status:** Template - Ready for Execution

---

## Overview

This audit template is customized for the llm-sv-tabs architecture:
- **Main Process**: TabManager owns WebContentsView instances and tab metadata (`Map<string, TabWithView>`)
- **Renderer Process**: Svelte stores mirror tab state for reactive UI (`activeTabs: Map<string, Tab>`)
- **IPC**: Global handlers with per-window routing, event broadcasting for state sync
- **Reactivity**: Mix of traditional Svelte stores and Svelte 5 runes ($state, $derived, $effect)

---

## 1. Object Ownership & Registry

### 1.1 Source of Truth Verification

**Question:** Is the Main process TabManager the single source of truth for tab existence?

**Audit Steps:**
- [ ] Verify `src/main/tab-manager.ts` `tabs: Map<string, TabWithView>` is the only place tabs are created
- [ ] Confirm Renderer cannot create tabs independently (only request via IPC)
- [ ] Check WindowRegistry is synchronized with TabManager state
- [ ] Validate session persistence captures Main state, not Renderer state

**Expected Pattern:**
```typescript
// Main: Source of truth
class TabManager {
  private tabs: Map<string, TabWithView> = new Map();
  createTab() { /* Creates in Main first */ }
}

// Renderer: Mirror only
export const activeTabs: Writable<Map<string, Tab>> = writable(new Map());
```

**Red Flags:**
- Renderer creating Tab objects without IPC round-trip
- Two Maps with same data but different update paths
- Direct DOM manipulation creating tab state

---

### 1.2 Unique Identifier Consistency

**Question:** Is `tabId: string` consistently used as the primary key across all systems?

**Audit Steps:**
- [ ] Search for all uses of `tabId`, `tab.id`, `view.webContents.id`
- [ ] Verify WindowRegistry uses `tabId` (not WebContents ID) for ownership
- [ ] Check IPC payloads use consistent `id` vs `tabId` field names
- [ ] Validate no mixing of `tabId` with `windowId` or `viewId`

**Known Implementation:**
- TabManager uses `tabId = createTabId()` (UUID-based)
- WindowRegistry maps `tabId → windowId`
- IPC events use `{ id: string }` for tab identification

**Red Flags:**
- Using `view.webContents.id` as primary key (WebContents can be recreated)
- Inconsistent field names in IPC payloads (`id` vs `tabId` vs `tab.id`)
- Storing tabs in arrays indexed by position instead of Map keyed by ID

---

### 1.3 Cleanup Trigger & Death Sequence

**Question:** When `closeTab(tabId)` is called, does the cleanup sequence cover all resources?

**Audit Steps:**
- [ ] Trace `closeTab()` in `tab-manager.ts:559-621`
- [ ] Verify WebContentsView removal: `window.contentView.removeChildView(view)`
- [ ] Check temp file cleanup: `tempFileService.cleanupForTab(tabId)`
- [ ] Confirm Map deletion: `this.tabs.delete(tabId)`
- [ ] Validate WindowRegistry cleanup: `windowRegistry.removeTab(tabId)`
- [ ] Check active tab switch logic if closed tab was active
- [ ] Verify IPC broadcast: `sendToRenderer('tab-closed', { id })`
- [ ] Confirm Renderer cleanup: `removeTab(id)` updates stores

**Expected Death Sequence:**
```
1. closeTab(tabId) called in Main
2. Remove WebContentsView from window → WebContents auto-destroyed
3. Clean temp files for tab
4. Delete from tabs Map
5. Remove from WindowRegistry
6. Switch active tab if needed
7. Broadcast 'tab-closed' to Renderer
8. Renderer removes from activeTabs store → components react
9. Session saved to disk
```

**Red Flags:**
- Resources cleaned in wrong order (e.g., deleting from Map before removing View)
- Missing cleanup steps (temp files, registry, stores)
- No verification that Renderer received close event
- WebContents manually destroyed (should auto-destroy with View removal)

---

## 2. IPC & Listener Lifecycles

### 2.1 Listener Scoping in Components

**Question:** Are component-level IPC listeners properly scoped with cleanup?

**Audit Steps:**
- [ ] Audit all calls to `window.electron.onLLMChunk()`, `onTabCreated()`, etc. in `.svelte` files
- [ ] Verify each listener returns cleanup function from `onMount` or assigns to variable
- [ ] Check `onDestroy()` calls cleanup functions
- [ ] Search for orphaned listeners (added but never removed)

**Expected Pattern (from MessageStream.svelte):**
```svelte
<script>
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onLLMChunk((data) => {
      if (data.tabId === tabId) { /* handle */ }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>
```

**Red Flags:**
- Listeners added in `onMount` with no `onDestroy` cleanup
- Global listeners registered in component scope (should be in `electron-listeners.ts`)
- Anonymous functions passed to listeners with no reference kept for removal
- `$effect` adding listeners without returning cleanup function

---

### 2.2 Anonymous Function Pitfall

**Question:** Are listeners using named functions or storing references for later removal?

**Audit Steps:**
- [ ] Search for `window.electron.on*` calls in Svelte components
- [ ] Check if cleanup function is captured: `const unsub = window.electron.on*()`
- [ ] Verify preload.ts `addListener()` returns cleanup function (line 24-28)

**Current Implementation (Good):**
```typescript
// preload.ts
const addListener = <T>(channel: string, callback: (data: T) => void) => {
  const handler = (_event: unknown, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);  // Cleanup returned
};
```

**Red Flags:**
- Direct `ipcRenderer.on()` calls without corresponding `off()`
- Listeners added inside reactive blocks without cleanup

---

### 2.3 Channel Scoping Strategy

**Question:** Do global IPC channels filter correctly per-tab, or do all tabs process all events?

**Audit Steps:**
- [ ] Identify all broadcast channels: `tab-created`, `tab-updated`, `tab-closed`, `llm-stream-chunk`, etc.
- [ ] Check MessageStream.svelte filters `data.tabId === tabId` before processing (line 231)
- [ ] Verify throttling doesn't cause cross-tab contamination (line 352-377 in tab-manager.ts)
- [ ] Validate selectedTabs listeners don't accumulate per component instance

**Current Pattern:**
- **Global broadcast**: All windows receive `tab-created`, `tab-updated`, etc.
- **Component filtering**: Each MessageStream checks `if (data.tabId === tabId)`
- **Risk**: N tabs = N listener invocations per event (but filtered quickly)

**Optimization Opportunities:**
- Consider per-tab channels: `tab-update-${tabId}` (reduces broadcast noise)
- OR keep global channel but ensure filtering is first line of listener (already done)

**Red Flags:**
- Expensive operations happening before `tabId` filter check
- State mutations inside listener before checking if event applies to this component

---

## 3. Svelte 5 Rune Concurrency

### 3.1 Stale Response Guard

**Question:** When rapidly switching tabs, can a late-arriving metadata response overwrite current tab's data?

**Audit Steps:**
- [ ] Audit `MessageStream.svelte` `$effect` blocks (lines 62-92)
- [ ] Check if `tabId` prop changes invalidate pending responses
- [ ] Verify `lastAppliedMetadataResponse` prevents duplicate processing
- [ ] Test: Switch tabs rapidly while LLM streaming active

**Current Guard Mechanism (MessageStream.svelte):**
```svelte
let lastAppliedMetadataResponse = $state('');

$effect(() => {
  const metadataResponse = metadata?.response || '';
  if (metadataResponse && metadataResponse !== lastAppliedMetadataResponse) {
    lastAppliedMetadataResponse = metadataResponse;
    fullText = metadataResponse;
    updateBuffers();
  }
});
```

**Question:** If `tabId` prop changes, does this reset guards?
- [ ] Check if `lastAppliedMetadataResponse` persists across tab switches
- [ ] Verify `$effect` re-runs when `tabId` changes via `tab = $derived($activeTabs.get(tabId))`

**Red Flags:**
- No `tabId` in guard comparison (could apply Tab A's response to Tab B)
- Async operations not cancelled when component re-renders with new `tabId`
- `$effect` not re-running when `tabId` changes

---

### 3.2 Reactivity Loops

**Question:** Can an `$effect` trigger IPC send → Main update → IPC receive → same `$effect` again?

**Audit Steps:**
- [ ] Search for `$effect` blocks calling `window.electron.*()` methods
- [ ] Identify if those methods trigger IPC events that update same reactive state
- [ ] Check for infinite loop protection (guard variables, condition checks)

**Known Safe Patterns:**
- User action → IPC invoke → Main update → IPC event → Store update → UI reflects change ✅
- **Not** `$effect` watching store → IPC send → Store update → `$effect` triggers again ❌

**Red Flags:**
- `$effect(() => { if (someState) window.electron.updateTab() })` where `updateTab` triggers state change
- No guard variable preventing re-entry

---

### 3.3 State Serialization Across IPC

**Question:** Are we accidentally sending Svelte Proxy objects to Main, or properly serializing?

**Audit Steps:**
- [ ] Search for `window.electron.*()` calls passing objects from stores
- [ ] Check if `unstate()` or `JSON.parse(JSON.stringify())` used
- [ ] Verify Main process doesn't receive `[object Proxy]`

**Current Implementation:**
```typescript
// ipc/handlers/tabs.ts (lines 81-85)
ipcMain.handle('update-tab', async (event, { tabId, updates }: UpdateTabPayload) => {
  const windowId = resolveWindowId(event);
  await tabManager.updateTabMetadata(tabId, updates, windowId);
});
```

**Question:** What is the type of `updates`? Is it pre-serialized?
- [ ] Check call sites in Svelte components for how `updates` is constructed
- [ ] Verify no reactive proxies passed

**Red Flags:**
- Passing `$state` objects directly to IPC without serialization
- Using `structuredClone()` which may fail on Proxies
- Receiving errors in Main about non-serializable objects

---

## 4. Memory & Performance Audits

### 4.1 Large Content Buffer Management

**Question:** For PDF tabs with large base64 data or note tabs with long text, is content cleared immediately on tab close?

**Audit Steps:**
- [ ] Check `TabWithView` type definition for content storage
- [ ] Verify `closeTab()` deletes from Map (triggers GC)
- [ ] Search for global caches holding references to closed tabs
- [ ] Profile memory: Open 10 PDF tabs → close all → heap snapshot

**Expected Behavior:**
- PDFs use temp files (`file://` URLs) created by TempFileService
- Temp files deleted on tab close: `tempFileService.cleanupForTab(tabId)` (line 583)
- No in-memory base64 caching after tab closes

**Red Flags:**
- Large buffers stored in Renderer `activeTabs` store after Main tab closed
- Temp files not deleted (check `/tmp/llm-sv-tabs-*`)
- Content duplicated across Main and Renderer

---

### 4.2 WebContentsView Lifecycle

**Question:** Does closing a tab in UI fully destroy the underlying Electron WebContentsView?

**Audit Steps:**
- [ ] Verify `closeTab()` calls `window.contentView.removeChildView(view)` (line 574-578)
- [ ] Confirm no manual `view.webContents.destroy()` needed (auto-destroys with View removal)
- [ ] Check bounds update logic doesn't reference destroyed Views (lines 643-653)
- [ ] Test: Close tab → check `webContents.getAllWebContents()` count decreases

**Current Implementation (tab-manager.ts:574-578):**
```typescript
if (tab.view) {
  try {
    context.window.contentView.removeChildView(tab.view);
  } catch (error) {
    this.logger.warn(`Failed to remove view for tab ${tabId}:`, error);
  }
}
```

**Known Issue (Mitigated):**
- Lines 643-653: Try-catch around `view.setBounds()` for destroyed Views
- Indicates past race conditions, now handled gracefully

**Red Flags:**
- `view.setBounds()` called after `removeChildView()`
- WebContents references held after View removal
- Event listeners on WebContents not automatically cleaned up

---

### 4.3 Svelte Component Key Binding

**Question:** Does the tab list use proper `{#key}` or `{#each}` keys to prevent DOM node reuse?

**Audit Steps:**
- [ ] Search for `{#each $sortedTabs as tab}` in Svelte components
- [ ] Verify `{#each $sortedTabs as tab (tab.id)}` has key parameter
- [ ] Check if tab switching uses `{#key activeTabId}` to force remount

**Audit Files:**
- `src/ui/components/TabList.svelte`
- `src/ui/components/MessageStream.svelte`

**Expected Pattern:**
```svelte
{#each $sortedTabs as tab (tab.id)}
  <TabItem {tab} />
{/each}
```

**Red Flags:**
- No key in `{#each}` loop → Svelte may reuse DOM nodes incorrectly
- Using array index as key instead of stable `tab.id`
- Tab content rendered without `{#key tabId}` guard

---

## 5. Error & Edge Case Recovery

### 5.1 Renderer Crash Recovery

**Question:** If Renderer process reloads, how does Main re-sync its tab list?

**Audit Steps:**
- [ ] Check if Main sends full tab list on window creation (search for 'did-finish-load' or similar)
- [ ] Verify session restoration logic in `session-manager.ts`
- [ ] Test: Force Renderer reload (Ctrl+R) → check if tabs reappear

**Expected Behavior:**
- SessionManager saves tabs every 30s + on tab changes
- On app startup, sessions loaded and tabs recreated
- **Question:** On Renderer-only reload, are tabs re-sent?

**Audit Files:**
- `src/main/session-manager.ts` (lines 32-119 for restore logic)
- `src/main/main.ts` (window creation hooks)

**Red Flags:**
- No tab re-sync after Renderer reload (tabs disappear from UI)
- Session only restored on full app restart, not Renderer hot-reload

---

### 5.2 Abort Controllers for Tab-Scoped Fetches

**Question:** If a tab is closed while metadata/LLM response is loading, is the request cancelled?

**Audit Steps:**
- [ ] Search for `fetch()` calls or provider stream methods in `src/main/providers/`
- [ ] Check if `AbortController` used and tied to `tabId` lifecycle
- [ ] Verify `closeTab()` aborts pending requests for that tab

**Current Implementation:**
- LLM providers use streaming APIs (OpenAI, Anthropic, Ollama)
- **Question:** Are streams aborted when tab closes?

**Audit Files:**
- `src/main/providers/openai.ts`
- `src/main/providers/anthropic.ts`
- `src/main/providers/ollama.ts`
- `src/main/tab-manager.ts` closeTab method

**Red Flags:**
- No `AbortController` passed to provider calls
- Streams continue after tab closed, writing to deleted tab
- Errors logged for "tab not found" during streaming

---

## 6. Window Multi-Instance Concurrency

### 6.1 WindowRegistry Synchronization

**Question:** With multiple BrowserWindows, can tabs get assigned to wrong window?

**Audit Steps:**
- [ ] Verify `WindowRegistry.setTabOwner(tabId, windowId)` called on tab creation
- [ ] Check `resolveWindowId(event)` in IPC handlers correctly identifies sender window
- [ ] Test: Open 2 windows → create tab in Window A → verify it doesn't appear in Window B

**Current Implementation:**
- `window-registry.ts` maintains `Map<string, WindowData>`
- Each tab operation resolves `windowId` from IPC event sender
- `getWindowContext()` throws if window not found

**Red Flags:**
- Tabs appearing in wrong window after creation
- `resolveWindowId()` returning incorrect window
- Active tab in Window A changed when interacting with Window B

---

## 7. Implementation Task List

### Immediate Audit Tasks
- [ ] **Memory Profile**: Open 20 tabs (mix of web, LLM, notes, PDFs) → close all → take heap snapshot
  - **Pass Criteria**: Memory returns to ~baseline, no large retained buffers
- [ ] **IPC Listener Audit**: Grep for all `window.electron.on*` calls, verify cleanup
  - **Pass Criteria**: Every listener has `onDestroy` cleanup or is app-lifetime scoped
- [ ] **Rapid Tab Switch Test**: Start LLM stream → switch tabs 10 times rapidly → verify no content bleed
  - **Pass Criteria**: Each tab shows correct content, no mixed responses
- [ ] **Renderer Reload Test**: Open 5 tabs → reload Renderer (Ctrl+R) → verify tabs restored
  - **Pass Criteria**: All tabs reappear with correct content
- [ ] **Tab Close Sequence Trace**: Add debug logging to `closeTab()` → verify all cleanup steps execute
  - **Pass Criteria**: Logs show View removal → temp cleanup → Map deletion → IPC broadcast

### Refactoring Opportunities (Post-Audit)
- [ ] Add `AbortController` to LLM provider streams, abort on `closeTab()`
- [ ] Consider per-tab IPC channels if global broadcast becomes bottleneck (profile first)
- [ ] Add `{#key tabId}` to MessageStream component to force full remount on tab switch
- [ ] Add heap size metrics to DevTools for live memory monitoring

### Continuous Monitoring
- [ ] Add automated test: Open N tabs → close → check temp file cleanup
- [ ] Add E2E test: Multi-window tab creation and isolation
- [ ] Profile startup time with 50 restored tabs (session load performance)

---

## Audit Execution Checklist

When ready to execute this audit:

1. **Preparation**
   - [ ] Create feature branch: `audit/resource-lifecycle`
   - [ ] Install memory profiling tools: Chrome DevTools, `clinic.js`, or Electron DevTools
   - [ ] Set up logging: Add debug logs to critical lifecycle methods

2. **Execution**
   - [ ] Work through sections 1-6 systematically
   - [ ] Document findings in `docs/AUDIT_FINDINGS.md`
   - [ ] Create GitHub issues for each discovered problem
   - [ ] Prioritize issues: Critical (memory leak) → High (race condition) → Medium (optimization)

3. **Validation**
   - [ ] Fix critical issues found
   - [ ] Re-run audit on fixed code
   - [ ] Add regression tests for fixed issues
   - [ ] Update design docs with new patterns

4. **Review**
   - [ ] Team review of findings and fixes
   - [ ] Update this audit template based on lessons learned
   - [ ] Schedule next audit (quarterly recommended)
