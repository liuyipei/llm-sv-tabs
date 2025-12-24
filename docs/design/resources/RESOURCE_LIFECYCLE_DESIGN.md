# Resource & Lifecycle Design

**Status:** Living Document - Update when patterns change
**Last Updated:** 2025-12-24
**Audience:** All contributors (for refactoring existing code and writing new code)

---

## Purpose

This document defines the **resource ownership model** and **lifecycle patterns** for llm-sv-tabs. Use this as a reference when:
- Adding new features that create resources (tabs, windows, services)
- Refactoring existing code to fix memory leaks or race conditions
- Reviewing PRs for proper cleanup and resource management
- Debugging lifecycle-related bugs (stale listeners, zombie tabs, etc.)

**Goal:** Minimize cognitive burden by establishing clear rules for "who owns what" and "who cleans up when."

---

## Core Principles

### 1. Single Source of Truth
**Rule:** Main process owns all persistent resources. Renderer mirrors state for UI reactivity.

**Why:** Prevents split-brain scenarios where Main and Renderer disagree on state.

**Implementation:**
- **Main:** `TabManager.tabs: Map<string, TabWithView>` = source of truth
- **Renderer:** `activeTabs: Map<string, Tab>` = reactive mirror
- **Sync:** IPC events (`tab-created`, `tab-updated`, `tab-closed`) keep them in sync

**Anti-pattern:**
```typescript
// ❌ BAD: Renderer creates state independently
function createTabInUI(url: string) {
  const newTab = { id: generateId(), url };
  $activeTabs.set(newTab.id, newTab);  // Main doesn't know about this!
}

// ✅ GOOD: Renderer requests, Main creates, IPC syncs
async function createTab(url: string) {
  const tab = await window.electron.openUrl(url);  // Main creates
  // Renderer receives 'tab-created' event → store updated
}
```

---

### 2. Explicit Ownership
**Rule:** Every resource has exactly one owner responsible for its destruction.

**Ownership Map:**

| Resource | Owner | Lifetime | Cleanup Trigger |
|----------|-------|----------|-----------------|
| `TabWithView` object | TabManager (Main) | Until `closeTab()` | User close, window close |
| `WebContentsView` | TabManager (Main) | Same as TabWithView | Removed from window → auto-destroys |
| Temp file (`/tmp/llm-sv-tabs-*`) | TempFileService (Main) | Until tab close or app exit | `cleanupForTab()`, `cleanupAll()` |
| WindowRegistry entry | WindowRegistry (Main) | Until window closed | Window 'close' event |
| Svelte component | Svelte runtime | Until unmount | `onDestroy()` |
| IPC listener (component-scoped) | Component | Until unmount | `onDestroy()` cleanup function |
| IPC listener (app-scoped) | electron-listeners.ts | App lifetime | Never (intentional) |
| Store subscription | Component | Until unmount | `onDestroy()` cleanup function |
| DOM search instance | Component | Until unmount | `domSearch.destroy()` in `onDestroy()` |

**Rule of Thumb:** If you allocate it, you clean it up. If you don't know who should clean it up, you're introducing a leak.

---

### 3. Cleanup Before Deletion
**Rule:** Release/detach resources before deleting references.

**Why:** Prevents dangling pointers, use-after-free, and object resurrection.

**Example (tab-manager.ts:559-621):**
```typescript
async closeTab(tabId: string, windowId?: WindowId): Promise<void> {
  const tab = this.tabs.get(tabId);
  if (!tab) return;

  const context = this.windowRegistry.getWindowContext(windowId ?? tab.windowId);

  // 1. Detach WebContentsView (if exists)
  if (tab.view) {
    try {
      context.window.contentView.removeChildView(tab.view);
      // WebContents auto-destroyed by View removal
    } catch (error) {
      this.logger.warn(`Failed to remove view for tab ${tabId}`, error);
    }
  }

  // 2. Clean temp files
  this.tempFileService.cleanupForTab(tabId);

  // 3. Delete from registry BEFORE deleting from Map
  this.windowRegistry.removeTab(tabId);

  // 4. Delete from Map (last step)
  this.tabs.delete(tabId);

  // 5. Handle side effects (active tab switch, session save)
  if (context.activeTabId === tabId) {
    await this.setActiveTab(newActiveTabId, windowId);
  }

  // 6. Notify Renderer (after Main cleanup complete)
  this.sendToRenderer('tab-closed', { id: tabId }, windowId);

  // 7. Persist session
  await this.sessionManager.saveSession();
}
```

**Order matters:**
1. Detach from parent containers (Views from Windows)
2. Clean external resources (files, network)
3. Remove cross-references (registries)
4. Delete from primary storage (Maps)
5. Handle derived state (active tab changes)
6. Broadcast changes (IPC)
7. Persist state

**Anti-pattern:**
```typescript
// ❌ BAD: Delete first, cleanup later (may throw errors)
this.tabs.delete(tabId);
this.windowRegistry.removeTab(tabId);  // May fail if tab lookup needed
tab.view.destroy();  // tab is undefined now!
```

---

### 4. Cleanup Functions Over Manual Removal
**Rule:** Prefer returning cleanup functions from setup code.

**Why:** Makes cleanup automatic and impossible to forget.

**Pattern (preload.ts:24-28):**
```typescript
const addListener = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  const handler = (_event: unknown, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);  // Cleanup function
};
```

**Usage in Components:**
```svelte
<script>
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabCreated((tab) => {
      // Handle tab creation
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();  // Automatic cleanup
  });
</script>
```

**Anti-pattern:**
```svelte
<script>
  onMount(() => {
    window.electron.onTabCreated((tab) => { /* ... */ });
    // ❌ No cleanup! Listener persists after unmount
  });
</script>
```

---

### 5. Fail-Safe Defaults
**Rule:** Design for graceful degradation when cleanup fails.

**Strategies:**
- **Try-catch around cleanup:** Log errors, don't throw (see tab-manager.ts:574-578)
- **Idempotent cleanup:** Safe to call multiple times (`cleanupForTab()` checks if files exist)
- **Defensive checks:** Verify resources exist before cleanup (`if (tab.view)`)

**Example:**
```typescript
try {
  context.window.contentView.removeChildView(tab.view);
} catch (error) {
  this.logger.warn(`Failed to remove view for tab ${tabId}:`, error);
  // Continue with rest of cleanup anyway
}
```

**Why:** A failed cleanup step shouldn't prevent other cleanup from running.

---

## Lifecycle Flows

### Tab Creation Flow

```
User Action (UI or external)
  ↓
IPC: openUrl({ url })
  ↓
Main: TabManager.openUrl()
  ├─ Generate tabId = createTabId()
  ├─ Create TabWithView object
  │  └─ Create WebContentsView (if URL-based)
  ├─ Add to Map: tabs.set(tabId, tab)
  ├─ Register: windowRegistry.setTabOwner(tabId, windowId)
  ├─ Optionally set active: setActiveTab(tabId, windowId)
  └─ IPC: sendToRenderer('tab-created', { tab })
       ↓
Renderer: electron-listeners.ts → addTab()
  ├─ Update store: $activeTabs.set(tab.id, tab)
  └─ Svelte components react via $derived
       ↓
UI: Tab appears in sidebar, content rendered
```

**Key Points:**
- Main creates tab **before** notifying Renderer
- Renderer **never** creates tabs independently
- WebContentsView creation may be deferred (LLM/note tabs don't need Views initially)

---

### Tab Destruction Flow

```
User Action (close tab button, Cmd+W)
  ↓
IPC: closeTab({ tabId })
  ↓
Main: TabManager.closeTab()
  ├─ Get tab from Map
  ├─ Remove WebContentsView from window
  │  └─ WebContents auto-destroys
  ├─ TempFileService.cleanupForTab(tabId)
  ├─ WindowRegistry.removeTab(tabId)
  ├─ tabs.delete(tabId)
  ├─ If was active: setActiveTab(newTabId)
  ├─ IPC: sendToRenderer('tab-closed', { id })
  └─ SessionManager.saveSession()
       ↓
Renderer: electron-listeners.ts → removeTab()
  ├─ Update store: $activeTabs.delete(tabId)
  └─ Svelte components unmount (if TabItem removed)
       ↓
Component: onDestroy() lifecycle
  ├─ IPC listener cleanup (unsubscribe())
  ├─ Store subscription cleanup
  ├─ DOM search cleanup (domSearch.destroy())
  └─ Component GC eligible
       ↓
UI: Tab removed from sidebar, content destroyed
```

**Key Points:**
- Main destroys resources **before** notifying Renderer
- Renderer cleanup is reactive (store change → component unmount)
- Component `onDestroy()` handles its own cleanup (listeners, subscriptions)

---

### Window Close Flow

```
User closes BrowserWindow
  ↓
Window: 'close' event
  ↓
Main: WindowRegistry.handleWindowClosed(windowId)
  ├─ Get all tabs owned by window
  ├─ For each tab: windowRegistry.removeTab(tabId)
  ├─ Detach active WebContentsView (if any)
  └─ windows.delete(windowId)
       ↓
Main: TabManager references cleared
  └─ TabManager instance may be GC'd if last window
```

**Key Points:**
- Tabs are **not** explicitly destroyed on window close (they're already gone)
- Registry cleanup prevents dangling window references
- App continues if other windows exist

---

### LLM Streaming Flow

```
User sends prompt
  ↓
IPC: openLLMResponseTab({ query, selectedTabIds })
  ↓
Main: TabManager.openLLMResponseTab()
  ├─ Create tab with type: 'llm-response', isStreaming: true
  ├─ sendToRenderer('tab-created')
  └─ Start provider stream (OpenAI, Anthropic, etc.)
       ↓
Provider: Yields chunks
  ↓
Main: TabManager.sendStreamChunk(tabId, chunk)
  ├─ Accumulate in tab.metadata.response
  ├─ IPC: sendToRenderer('llm-stream-chunk', { tabId, chunk })
  └─ Throttled metadata update (500ms): sendToRenderer('tab-updated')
       ↓
Renderer: MessageStream.svelte
  ├─ onLLMChunk listener → append to fullText ($state)
  ├─ $effect watches metadata.response changes
  ├─ updateBuffers() → split stable/unstable markdown
  └─ Render incrementally
       ↓
Stream completes
  ↓
Main: markLLMStreamingComplete(tabId)
  ├─ Set isStreaming: false
  └─ sendToRenderer('tab-updated', { tab })
       ↓
Renderer: $effect sees isStreaming: false → final render
```

**Concurrency Concerns:**
- **Rapid tab switch:** MessageStream component may receive chunks for old tab
- **Guard:** `if (data.tabId === tabId)` filter in listener (line 231)
- **Deduplication:** `lastAppliedMetadataResponse` prevents re-processing same data

---

## Svelte 5 Rune Patterns

### $state: Component-Local Reactive State

**Use for:** Data owned by a single component, not shared globally.

**Example (MessageStream.svelte):**
```svelte
<script>
  let fullText = $state('');              // Accumulated LLM response
  let stableHtml = $state('');            // Rendered markdown (stable part)
  let unstableHtml = $state('');          // Rendered markdown (streaming part)
  let lastAppliedMetadataResponse = $state('');  // Deduplication guard
</script>
```

**Lifecycle:**
- Created when component mounts
- Updates trigger re-renders
- GC'd when component unmounts

**Cleanup:** Automatic (no manual cleanup needed).

---

### $derived: Computed Values from Stores or State

**Use for:** Values computed from stores or other state, re-computed when dependencies change.

**Example (MessageStream.svelte):**
```svelte
<script>
  let { tabId }: { tabId: string } = $props();

  const tab = $derived($activeTabs.get(tabId));        // Reactive lookup
  const metadata = $derived(tab?.metadata);            // Nested access
  const isStreaming = $derived(metadata?.isStreaming); // Boolean flag

  const contextTabs = $derived.by((): Array<ContextTabInfo> => {
    if (metadata?.contextTabs?.length > 0) return metadata.contextTabs;
    return metadata?.selectedTabIds?.map(...).filter(...) || [];
  });
</script>
```

**Key Points:**
- Re-computes when `$activeTabs`, `tabId`, or `metadata` changes
- Use `$derived.by()` for complex computations
- No manual dependency tracking needed

**Lifecycle:** Re-runs on dependency change, GC'd when component unmounts.

---

### $effect: Side Effects Triggered by State Changes

**Use for:** Running code when reactive dependencies change (DOM updates, logging, IPC calls).

**Example (MessageStream.svelte):**
```svelte
<script>
  $effect(() => {
    const metadataResponse = metadata?.response || '';
    if (metadataResponse && metadataResponse !== lastAppliedMetadataResponse) {
      lastAppliedMetadataResponse = metadataResponse;
      fullText = metadataResponse;
      updateBuffers();
    }
  });

  // Cleanup pattern
  $effect(() => {
    const unsub = window.electron.onLLMChunk((data) => {
      if (data.tabId === tabId) {
        fullText += data.chunk;
        updateBuffers();
      }
    });

    return () => unsub();  // Cleanup when effect re-runs or component unmounts
  });
</script>
```

**Critical Rules:**
1. **Return cleanup function** if effect adds listeners or creates resources
2. **Guard conditions** to prevent unnecessary work
3. **Avoid infinite loops:** Don't update state that triggers same effect

**Lifecycle:** Runs after component mounts, re-runs when dependencies change, cleanup runs before re-run or unmount.

---

### Store Subscriptions in Components

**Pattern:**
```svelte
<script>
  import { activeTabs } from '$stores/tabs';

  let localCopy = $state([]);
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = activeTabs.subscribe((tabs) => {
      localCopy = Array.from(tabs.values());
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>
```

**OR use auto-subscriptions:**
```svelte
<script>
  import { activeTabs } from '$stores/tabs';

  // Auto-subscribes with $ prefix, auto-unsubscribes on unmount
  {#each Array.from($activeTabs.values()) as tab}
    <TabItem {tab} />
  {/each}
</script>
```

**Prefer:** Auto-subscriptions (`$activeTabs`) for simplicity unless you need custom logic.

---

## IPC Listener Scoping

### App-Lifetime Listeners (electron-listeners.ts)

**Use for:** Global state updates that affect all components.

**Pattern:**
```typescript
export function setupElectronListeners() {
  window.electron.onTabCreated((tab) => {
    addTab(tab);
  });

  window.electron.onTabClosed((data) => {
    removeTab(data.id);
  });

  // No cleanup returned - these persist for app lifetime
  return () => {};  // No-op cleanup
}
```

**Called from:** `App.svelte` `onMount()`

**Lifetime:** App start → app exit (never removed).

**Rationale:** These update global stores, so they should always be active.

---

### Component-Lifetime Listeners

**Use for:** Events specific to a component instance (e.g., LLM chunks for a specific tab).

**Pattern (MessageStream.svelte):**
```svelte
<script>
  let { tabId }: { tabId: string } = $props();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onLLMChunk((data) => {
      if (data.tabId === tabId) {  // Filter to this component's tab
        fullText += data.chunk;
        updateBuffers();
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();  // Remove listener when component unmounts
  });
</script>
```

**Key Points:**
- Listener added in `onMount`, removed in `onDestroy`
- Filter by `tabId` to ignore events for other tabs
- Cleanup function prevents memory leaks

---

### $effect-Based Listeners

**Pattern:**
```svelte
<script>
  $effect(() => {
    const unsub = window.electron.onSomeEvent((data) => {
      // Handle event
    });

    return () => unsub();  // Cleanup
  });
</script>
```

**When to use:**
- When listener needs to react to reactive dependencies
- When listener should re-register on state change

**Example:** Re-register listener when `tabId` changes:
```svelte
<script>
  let { tabId } = $props();

  $effect(() => {
    // Re-runs when tabId changes
    const unsub = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) {
        // Handle update for current tab
      }
    });

    return () => unsub();  // Cleanup old listener before re-registering
  });
</script>
```

---

## Anti-Patterns to Avoid

### ❌ Creating Resources Without Cleanup

```typescript
// BAD
onMount(() => {
  window.electron.onTabCreated((tab) => {
    // No cleanup! Listener persists after unmount
  });
});

// GOOD
onMount(() => {
  const unsub = window.electron.onTabCreated((tab) => {
    // Handle
  });
  return unsub;  // Or store for later cleanup
});

onDestroy(() => {
  if (unsub) unsub();
});
```

---

### ❌ Mutating Stores Directly

```typescript
// BAD: Bypasses reactivity
$activeTabs.get(tabId).title = 'New Title';

// GOOD: Replace with new object
const tab = $activeTabs.get(tabId);
if (tab) {
  $activeTabs.set(tabId, { ...tab, title: 'New Title' });
}

// BETTER: Let Main process update, Renderer receives IPC event
await window.electron.updateTab(tabId, { title: 'New Title' });
```

---

### ❌ Cleaning Up in Wrong Order

```typescript
// BAD: Delete first, cleanup fails
this.tabs.delete(tabId);
const tab = this.tabs.get(tabId);  // undefined!
if (tab.view) {
  // Never runs
}

// GOOD: Get reference, cleanup, then delete
const tab = this.tabs.get(tabId);
if (tab?.view) {
  window.contentView.removeChildView(tab.view);
}
this.tabs.delete(tabId);
```

---

### ❌ Passing Reactive Proxies to IPC

```typescript
// BAD: Sends Svelte Proxy object
const tab = $activeTabs.get(tabId);
await window.electron.updateTab(tabId, tab);  // Serialization error!

// GOOD: Send plain objects
await window.electron.updateTab(tabId, {
  title: tab.title,
  url: tab.url,
});
```

---

### ❌ No Guard Against Stale Async Responses

```typescript
// BAD: Late response overwrites current tab
$effect(() => {
  const response = metadata?.response;
  fullText = response;  // What if tabId changed since request?
});

// GOOD: Guard with deduplication
let lastAppliedResponse = $state('');

$effect(() => {
  const response = metadata?.response || '';
  if (response && response !== lastAppliedResponse) {
    lastAppliedResponse = response;
    fullText = response;
  }
});
```

---

## Refactoring Checklist

When refactoring existing code, use this checklist:

### Adding a New Resource Type
- [ ] Define owner (Main or Renderer?)
- [ ] Add to ownership table (section 2)
- [ ] Implement cleanup trigger
- [ ] Add cleanup to shutdown sequence (`shutdownManager.registerCleanup()`)
- [ ] Document lifecycle flow (section 4)
- [ ] Add tests for creation and cleanup

### Adding a New Svelte Component
- [ ] Identify reactive dependencies (stores, props, derived state)
- [ ] Use `$state` for local state, `$derived` for computed values
- [ ] Add `onDestroy()` if component creates listeners or subscriptions
- [ ] Verify no `$effect` infinite loops
- [ ] Test rapid mount/unmount (no memory leaks)

### Adding a New IPC Channel
- [ ] Decide scope: app-lifetime or component-lifetime
- [ ] If app-lifetime: Add to `electron-listeners.ts`
- [ ] If component-lifetime: Add in component `onMount`, cleanup in `onDestroy`
- [ ] Add type definitions to `preload.ts`
- [ ] Document in IPC channel table (Audit doc section 2.3)

### Fixing a Memory Leak
- [ ] Identify leaking resource (heap snapshot, Chrome DevTools)
- [ ] Trace ownership (who created it?)
- [ ] Find missing cleanup (search for create/open without corresponding destroy/close)
- [ ] Add cleanup function
- [ ] Add regression test (create → destroy → verify GC)

### Fixing a Race Condition
- [ ] Identify competing async operations
- [ ] Add guard variable or `lastApplied*` pattern
- [ ] Consider `AbortController` for cancellable operations
- [ ] Add test for rapid state changes

---

## Testing Strategies

### Memory Leak Detection
```bash
# Manual test
1. Open DevTools (Ctrl+Shift+I)
2. Heap Snapshot → Take snapshot (baseline)
3. Open 20 tabs
4. Heap Snapshot → Take snapshot (peak)
5. Close all tabs
6. Force GC (DevTools → Performance → Collect garbage)
7. Heap Snapshot → Take snapshot (final)
8. Compare: final should be ~baseline (within 10%)
```

**Automated:**
```typescript
// tests/lifecycle/memory.test.ts
test('closing tabs releases memory', async () => {
  const tabIds = await Promise.all(
    Array.from({ length: 20 }, () => window.electron.openUrl('https://example.com'))
  );

  await Promise.all(tabIds.map(id => window.electron.closeTab(id)));

  // Check temp files cleaned
  const tempFiles = await fs.readdir('/tmp/llm-sv-tabs-*');
  expect(tempFiles).toHaveLength(0);
});
```

---

### Listener Leak Detection
```typescript
// Count listeners before and after
const before = process._getActiveHandles().length;

// Add component
mount(MessageStream, { tabId: 'test' });

// Remove component
unmount();

const after = process._getActiveHandles().length;
expect(after).toBe(before);  // No leaked listeners
```

---

### Race Condition Testing
```typescript
test('rapid tab switching shows correct content', async () => {
  const tab1 = await window.electron.openLLMResponseTab('Query 1');
  const tab2 = await window.electron.openLLMResponseTab('Query 2');

  // Switch rapidly
  await window.electron.setActiveTab(tab1);
  await window.electron.setActiveTab(tab2);
  await window.electron.setActiveTab(tab1);

  // Wait for any pending updates
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify active tab shows correct content
  const activeTab = get(activeTabs).get(tab1);
  expect(activeTab.metadata.query).toBe('Query 1');
});
```

---

## Maintenance

**Review this document:**
- When adding new resource types
- When refactoring lifecycle code
- When fixing memory leaks or race conditions
- Quarterly (scheduled)

**Update sections:**
- Ownership table (section 2) when adding resources
- Lifecycle flows (section 4) when changing creation/destruction logic
- Anti-patterns (section 7) when discovering new pitfalls

**Link from code:**
```typescript
/**
 * Closes a tab and cleans up all associated resources.
 *
 * Lifecycle: See docs/design/resources/RESOURCE_LIFECYCLE_DESIGN.md#tab-destruction-flow
 */
async closeTab(tabId: string): Promise<void> {
  // ...
}
```

---

## Quick Reference

**Ownership:**
- Main owns persistent resources (tabs, windows, files)
- Renderer owns UI state (component state, derived values)

**Cleanup:**
- Always return cleanup functions from setup code
- Use `onDestroy()` in Svelte components
- Clean in reverse order of creation

**IPC:**
- App-lifetime listeners in `electron-listeners.ts`
- Component-lifetime listeners in component `onMount/onDestroy`
- Filter global events by `tabId` in component listeners

**Runes:**
- `$state` = local reactive variable
- `$derived` = computed value
- `$effect` = side effect (must return cleanup if creating resources)

**Testing:**
- Heap snapshots for memory leaks
- Listener count checks for listener leaks
- Rapid state changes for race conditions
