# Store Synchronization Across Process Boundaries

## Overview

Electron apps have a fundamental challenge that single-process web apps don't face: **state lives in two separate JavaScript VMs** (main process and renderer process). Reactive stores don't automatically synchronize across this boundary.

## The Problem

### Single-Process Reactive Apps (React/Vue/Svelte)

```
Update Store → Reactive Framework → Components Re-render
```

Everything happens in one memory space. Stores are truly reactive.

### Multi-Process Apps (Electron)

```
Main Process (Node.js VM)          Renderer Process (Chromium VM)
┌──────────────────────┐          ┌──────────────────────┐
│ tab.metadata = {...} │  ─────X──→ │ $activeTabs.get(id) │
│ (Source of Truth)    │  NO SYNC  │ (Stale Cache)       │
└──────────────────────┘          └──────────────────────┘
```

**The reactive chain is broken by the process boundary.**

Components read from the renderer store, which becomes stale when main process updates its state.

## The Solution: Explicit Synchronization

```
Main Process                      Renderer Process
┌──────────────────────┐          ┌──────────────────────┐
│ 1. Update state      │          │ 3. Receive event     │
│ 2. Send IPC event ────────────→ │ 4. Update store      │
│                      │          │ 5. Reactive re-render│
└──────────────────────┘          └──────────────────────┘
```

## Implementation Pattern

### Main Process: Update + Notify

```typescript
// tab-manager.ts
updateLLMResponseTab(tabId: string, response: string, metadata?: any) {
  const tab = this.tabs.get(tabId);

  // 1. Update source of truth
  if (tab?.metadata) {
    tab.metadata.response = response;
    Object.assign(tab.metadata, metadata);
  }

  // 2. Notify renderer (CRITICAL - don't skip this!)
  this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });

  // 3. Persist to disk
  this.saveSession();
}
```

**Anti-pattern (what we had):**
```typescript
// ❌ Updates state but never notifies renderer
updateLLMResponseTab(tabId: string, response: string, metadata?: any) {
  tab.metadata.response = response;
  // Missing: this.sendToRenderer('tab-updated', ...)
  this.saveSession();
}
```

### Renderer: Listen + Update Store

```typescript
// ipc-bridge.ts
export function initializeIPC() {
  // Listen for updates from main process
  window.electronAPI.onTabUpdated((data) => {
    // Update local store to stay in sync
    updateTab(data.tab.id, data.tab as Partial<Tab>);
  });
}
```

### Component: Read from Store

```typescript
// MessageStream.svelte
const tab = $derived($activeTabs.get(tabId));
const metadata = $derived(tab?.metadata);

// This now sees fresh data because store is synchronized
$effect(() => {
  if (metadata?.response) {
    fullText = metadata.response;
    updateBuffers();
  }
});
```

## Real-World Example: Streaming LLM Responses

### The Bug

During streaming:
1. Main process accumulates chunks in `tab.metadata.response` ✓
2. Main process sends each chunk via `'llm-stream-chunk'` IPC ✓
3. Main process **never** sends `'tab-updated'` to sync the store ❌
4. User navigates away and back
5. Component reads from stale store → sees empty `metadata.response` ❌
6. Only new chunks visible, old chunks lost

### The Fix

```typescript
// tab-manager.ts
sendStreamChunk(tabId: string, chunk: string): void {
  const tab = this.tabs.get(tabId);

  // 1. Accumulate in main process
  tab.metadata.response = (tab.metadata.response || '') + chunk;

  // 2. Send chunk for live viewing
  this.mainWindow.webContents.send('llm-stream-chunk', { tabId, chunk });

  // 3. Throttled store synchronization (500ms)
  const now = Date.now();
  if (now - this.lastMetadataUpdate.get(tabId) >= 500) {
    this.sendToRenderer('tab-updated', { tab: this.getTabData(tabId) });
    this.lastMetadataUpdate.set(tabId, now);
  }
}
```

**Key insight:** We need **two parallel channels**:
- `'llm-stream-chunk'`: For live, real-time rendering (component-level)
- `'tab-updated'`: For store synchronization (persistence-level)

## Diagnostic Clue

**"Direct IPC calls work, but reactive components don't"**

If you see this pattern:
- ✅ `ipc.getData()` returns correct data
- ❌ Component reading from store shows stale data

**Root cause:** Store synchronization missing.

**Why this happens:** Direct IPC call queries main process directly, bypassing the renderer store. Component reads from stale store.

## When to Apply This Pattern

Use explicit store synchronization when:

1. **Main process mutates state** that renderer displays
2. **State changes during background operations** (streaming, downloads, etc.)
3. **User can navigate away/back** and expect to see updated state
4. **Multiple components** read from the same store

## Testing Strategy

See `tests/integration/store-sync-pattern.test.md` for test patterns.

**Key test:**
```typescript
it('should sync main process updates to renderer store', async () => {
  // Update in main
  await mainProcess.updateState();

  // Wait for IPC
  await waitForStoreUpdate();

  // Assert renderer store is synced
  expect(rendererStore.getState()).toEqual(expectedState);
});
```

## Common Pitfalls

### 1. Forgetting to Send IPC Events

```typescript
// ❌ Main process updates, renderer never knows
tab.metadata.response = newValue;
```

**Fix:** Always send `'tab-updated'` after mutations.

### 2. Sending Events Too Frequently

```typescript
// ❌ Sends 100 events/second during streaming
for (const chunk of chunks) {
  sendToRenderer('tab-updated', ...); // Too many!
}
```

**Fix:** Throttle updates (e.g., 500ms) for high-frequency changes.

### 3. Not Waiting for Store Updates in Tests

```typescript
// ❌ Test checks store immediately
mainProcess.update();
expect(store.getState()).toBe(newState); // Fails - IPC not received yet
```

**Fix:** Wait for IPC propagation or use event listeners.

## Relationship to Other Patterns

- **Round-Trip Test** (`design/06-round-trip-test-pattern.md`): Tests component lifecycle (mount/unmount)
- **Store Sync Pattern** (this doc): Tests process boundary synchronization
- **Data Persistence Architecture** (`design/01-token-streaming-and-providers.md`): Where data lives (main vs renderer)

## Summary

**The fundamental rule:**

> In Electron, reactive stores are NOT automatically synchronized across process boundaries. Main process mutations require explicit IPC events to update renderer stores.

**The synchronization pattern:**
1. Main process: Mutate + Send IPC
2. Renderer: Receive IPC + Update store
3. Reactive framework: Detect store change + Re-render

**Miss step 1 or 2, and you get stale data bugs.**
