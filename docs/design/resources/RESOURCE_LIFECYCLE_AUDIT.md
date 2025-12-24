# Resource Lifecycle Audit Checklist

**Last Updated:** 2025-12-24

## Critical Resources

### 1. LLM Streaming Connections
- [ ] Verify `AbortController` passed to all provider `fetch()` calls
- [ ] Check `TabManager` stores controllers in `Map<tabId, AbortController>`
- [ ] Confirm `closeTab()` calls `controller.abort()` before cleanup
- [ ] Test: Close tab during stream → API request cancelled

**Files:**
- `src/main/providers/openai-provider.ts:137`
- `src/main/providers/anthropic-provider.ts:156`
- `src/main/providers/ollama-provider.ts:131`
- `src/main/tab-manager.ts:565` (cleanup location)

---

### 2. WebContentsView Event Listeners
- [ ] Verify `view.webContents.removeAllListeners()` called in `closeTab()`
- [ ] Check listener count doesn't grow with tab open/close cycles
- [ ] Test: Open 50 tabs → close all → heap snapshot shows no retained listeners

**Files:**
- `src/main/tab-manager.ts:239-347` (listeners attached)
- `src/main/tab-manager.ts:574` (cleanup location)

---

### 3. Temp Files
- [ ] Verify `tempFileService.cleanupForTab(tabId)` called in `closeTab()`
- [ ] Check `/tmp/llm-sv-tabs-*` directory emptied after closing PDF tabs
- [ ] Confirm `shutdownManager` registers temp file cleanup on app exit
- [ ] Test: Open 10 PDFs → close tabs → temp files deleted

**Files:**
- `src/main/services/temp-file-service.ts:91` (cleanup method)
- `src/main/tab-manager.ts:583` (cleanup call)
- `src/main/main.ts:161` (shutdown cleanup)

---

### 4. WebContentsView Instances
- [ ] Verify `removeChildView()` called before deleting tab from Map
- [ ] Check no references held after `tabs.delete(tabId)`
- [ ] Confirm `setBounds()` has try-catch for destroyed views
- [ ] Test: Open 50 tabs → close all → memory returns to baseline

**Files:**
- `src/main/tab-manager.ts:574` (view removal)
- `src/main/tab-manager.ts:586` (Map deletion)
- `src/main/tab-manager.ts:643-653` (bounds update safety)

---

## Svelte Component Lifecycle

### 5. IPC Listener Cleanup
- [ ] Search `*.svelte` for `window.electron.on*` without `onDestroy`
- [ ] Verify cleanup functions captured: `const unsub = window.electron.on*(...)`
- [ ] Check `onDestroy(() => { if (unsub) unsub(); })` exists
- [ ] Test: Mount/unmount component → listener count unchanged

**Pattern:**
```svelte
let unsub: (() => void) | null = null;
onMount(() => { unsub = window.electron.onX(...); });
onDestroy(() => { if (unsub) unsub(); });
```

---

### 6. Stale Async Response Guards
- [ ] Check MessageStream.svelte has `lastAppliedMetadataResponse` guard
- [ ] Verify guard includes both data AND `tabId` in comparison
- [ ] Test: Switch tabs rapidly during streaming → no content bleed

**Files:**
- `src/ui/components/chat/MessageStream.svelte:100-102`

---

### 7. Component Key Bindings
- [ ] Verify all `{#each}` loops use unique keys: `{#each items as item (item.id)}`
- [ ] Check no array index used as key
- [ ] Test: Reorder tabs → correct DOM nodes updated

**Command:** `rg '{#each.*as \w+}' src/ui/` (should return 0 results)

---

## Known Issues (Current Status)

| Issue | Severity | Status | Action |
|-------|----------|--------|--------|
| LLM streams not abortable | 🔴 Critical | ❌ Unfixed | Add AbortController tracking |
| WebContents listeners implicit cleanup | 🟡 High | ⚠️ Partial | Add explicit `removeAllListeners()` |
| IPC listeners in electron-listeners.ts | 🟡 Medium | ❌ Unfixed | Return composite cleanup function |
| Temp files | ✅ Good | ✅ Fixed | Already tracked properly |
| Component keys | ✅ Good | ✅ Fixed | All loops have keys |
| Stale response guards | ✅ Good | ✅ Fixed | MessageStream has guards |

---

## Quick Audit Commands

### Find components with listeners but no cleanup
```bash
rg "window\.electron\.on" src/ui/components/ -A 10 | grep -v "onDestroy"
```

### Find $effect without cleanup returns
```bash
rg "\$effect\(\(\) => \{" src/ui/ -A 20 | grep -v "return \(\)"
```

### Find Map.delete before cleanup
```bash
rg "\.delete\(" src/main/ -B 5 -A 5
```

### Check temp files during runtime
```bash
ls -lh /tmp/llm-sv-tabs-*
```

---

## Memory Leak Testing

### Heap Snapshot Method
1. Open DevTools → Memory tab
2. Take baseline snapshot
3. Open 20 tabs, close all
4. Force GC (Performance → Collect garbage icon)
5. Take final snapshot
6. Compare: Retained size should be ≈ baseline (±10%)

### Listener Count Method
```typescript
// Add to dev tools console
console.log('IPC listeners:', process._getActiveHandles().length);

// Before: note count
// Perform action (open/close tabs)
// After: count should return to baseline
```

### Temp File Method
```bash
# Before closing tabs
ls /tmp/llm-sv-tabs-* | wc -l

# After closing tabs
ls /tmp/llm-sv-tabs-* | wc -l  # Should be 0
```

---

## Quarterly Audit Schedule

**When:** Every 3 months or before major releases

**Process:**
1. Run all checklist items (1-7)
2. Execute memory leak tests
3. Profile app with 50+ tabs
4. Document findings in issue tracker
5. Prioritize fixes: Critical → High → Medium
6. Update this checklist with new patterns discovered
