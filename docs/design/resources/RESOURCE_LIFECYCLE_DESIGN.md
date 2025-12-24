# Resource & Lifecycle Design

**Last Updated:** 2025-12-24

## Resource Ownership

| Resource | Owner | Cleanup Trigger | File |
|----------|-------|----------------|------|
| `TabWithView` object | TabManager | `closeTab()` | `src/main/tab-manager.ts:565` |
| `WebContentsView` | TabManager | Removed from window → auto-destroys | `src/main/tab-manager.ts:574` |
| `WebContentsView` event listeners | TabManager | **Should call** `removeAllListeners()` | ⚠️ Currently implicit |
| LLM streaming connection | Provider | **Should use** `AbortController` | ❌ Not tracked |
| Temp file (`/tmp/llm-sv-tabs-*`) | TempFileService | `cleanupForTab(tabId)` | `src/main/services/temp-file-service.ts:91` |
| IPC listener (component) | Component | `onDestroy()` cleanup function | `src/ui/components/**/*.svelte` |
| IPC listener (app-scoped) | electron-listeners.ts | App lifetime (never) | `src/ui/utils/electron-listeners.ts` |

## Critical Patterns

### Tab Destruction Sequence (tab-manager.ts:565-606)

```typescript
async closeTab(tabId: string, windowId?: WindowId): Promise<void> {
  const tab = this.tabs.get(tabId);  // 1. Get reference BEFORE deleting

  // 2. Detach from parent
  if (tab.view) {
    context.window.contentView.removeChildView(tab.view);
  }

  // 3. Clean external resources
  this.tempFileService.cleanupForTab(tabId);

  // 4. Remove cross-references
  this.windowRegistry.removeTab(tabId);

  // 5. Delete from Map (last step)
  this.tabs.delete(tabId);

  // 6. Handle derived state
  if (wasActive) await this.setActiveTab(newTabId);

  // 7. Broadcast to Renderer
  this.sendToRenderer('tab-closed', { id: tabId });

  // 8. Persist
  await this.sessionManager.saveSession();
}
```

**Order matters:** Cleanup → Delete → Update → Broadcast

### Svelte Component Lifecycle

```svelte
<script>
  let { tabId } = $props();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // Setup: Capture cleanup function
    unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) { /* handle */ }
    });
  });

  onDestroy(() => {
    // Cleanup: Always call
    if (unsubscribe) unsubscribe();
  });
</script>
```

### Stale Async Response Guard

```svelte
<script>
  let { tabId } = $props();
  let lastApplied = $state({ tabId: '', data: '' });

  $effect(() => {
    const data = metadata?.data || '';
    // Guard: Check both data AND tabId changed
    if (data && (data !== lastApplied.data || tabId !== lastApplied.tabId)) {
      lastApplied = { tabId, data };
      // Process data
    }
  });
</script>
```

## Known Issues

### 1. LLM Streams Not Abortable (Critical)

**Problem:** Streams continue after tab close, wasting API quota.

**Files:**
- `src/main/providers/openai-provider.ts:137`
- `src/main/providers/anthropic-provider.ts:156`
- `src/main/providers/ollama-provider.ts:131`

**Fix needed:**
```typescript
// Store in TabManager
private abortControllers = new Map<string, AbortController>();

// In provider query
const controller = new AbortController();
this.abortControllers.set(tabId, controller);

const response = await fetch(url, {
  signal: controller.signal,
  // ...
});

// In closeTab()
const controller = this.abortControllers.get(tabId);
if (controller) {
  controller.abort();
  this.abortControllers.delete(tabId);
}
```

### 2. WebContents Listener Cleanup (High)

**Problem:** Event listeners rely on implicit cleanup when view is destroyed.

**Current:** `src/main/tab-manager.ts:239-347` - 6 listeners per tab, no explicit cleanup

**Fix needed:**
```typescript
// In closeTab(), before removeChildView()
if (tab.view) {
  tab.view.webContents.removeAllListeners();
  context.window.contentView.removeChildView(tab.view);
}
```

### 3. IPC Listener Leak in electron-listeners.ts (Medium)

**Problem:** `setupElectronListeners()` doesn't return actual cleanup functions.

**File:** `src/ui/utils/electron-listeners.ts:72`

**Fix needed:**
```typescript
export function setupElectronListeners() {
  const cleanups = [
    api.onFocusUrlBar(() => { /* ... */ }),
    api.onFocusSearchBar(() => { /* ... */ }),
    // ... capture all cleanup functions
  ];

  return () => cleanups.forEach(cleanup => cleanup());
}
```

## Svelte 5 Rune Usage

### $state - Local reactive variable
```svelte
let count = $state(0);  // Component-local, GC'd on unmount
```

### $derived - Computed value
```svelte
const doubled = $derived(count * 2);  // Re-computes when count changes
const tab = $derived($activeTabs.get(tabId));  // Reactive store lookup
```

### $effect - Side effects
```svelte
$effect(() => {
  console.log(count);  // No cleanup needed
});

$effect(() => {
  const unsub = api.onEvent(() => { /* ... */ });
  return () => unsub();  // Cleanup when effect re-runs or unmount
});
```

**Rule:** Use `$derived` for computation, `$effect` for side effects. Always return cleanup if `$effect` creates resources.

## Anti-Patterns

```typescript
// ❌ Delete before cleanup
this.tabs.delete(tabId);
if (tab.view) { /* ... */ }  // tab is undefined!

// ❌ $effect computing values (use $derived)
$effect(() => { doubled = count * 2; });

// ❌ No cleanup for listeners
onMount(() => {
  window.electron.onTabUpdate(() => { /* ... */ });  // Leaks!
});

// ❌ Passing Svelte Proxy to IPC
await window.electron.updateTab(tabId, $state_object);  // Serialization error
```

## Testing for Leaks

### Memory Test
```bash
# Open DevTools → Memory
1. Take heap snapshot (baseline)
2. Open 20 tabs → close all
3. Force GC (DevTools → Performance → Collect garbage)
4. Take heap snapshot (final)
5. Compare: final ≈ baseline (±10%)
```

### Listener Count Test
```typescript
test('component cleans up listeners', () => {
  const before = getListenerCount();
  const { unmount } = render(Component);
  unmount();
  expect(getListenerCount()).toBe(before);
});
```

### Temp File Test
```typescript
test('temp files cleaned on tab close', async () => {
  const tabId = await openPDFTab();
  expect(await getTempFiles(tabId)).toHaveLength(1);

  await closeTab(tabId);
  expect(await getTempFiles(tabId)).toHaveLength(0);
});
```
