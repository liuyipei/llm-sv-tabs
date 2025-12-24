# Refactoring Guide: Applying Resource Lifecycle Patterns

**Purpose:** Practical guide for applying the patterns from `RESOURCE_LIFECYCLE_DESIGN.md` to existing code.

**Target Audience:** Developers refactoring existing code or reviewing PRs.

---

## How to Use This Guide

1. **Pick a refactoring target** from the Priority List (section 1)
2. **Follow the step-by-step recipe** for that category (sections 2-5)
3. **Validate** using the test checklist (section 6)
4. **Update design docs** if you discover new patterns (section 7)

---

## 1. Priority Refactoring Targets

Based on the audit template (`RESOURCE_LIFECYCLE_AUDIT.md`), prioritize refactoring in this order:

### Critical (Memory Leaks / Data Loss)
- [ ] **Missing IPC listener cleanup** in Svelte components
- [ ] **Temp files not deleted** on tab close
- [ ] **WebContentsView not removed** before tab deletion
- [ ] **Store subscriptions not unsubscribed** in `onDestroy`

### High (Race Conditions / Bugs)
- [ ] **No guard against stale async responses** in streaming components
- [ ] **$effect infinite loops** (effect updates state that triggers same effect)
- [ ] **Missing AbortController** for tab-scoped fetches
- [ ] **No {#key} in tab lists** (DOM node reuse causing state bleed)

### Medium (Performance / Code Quality)
- [ ] **Global IPC listeners processing all events** (should filter early)
- [ ] **Redundant state in Main and Renderer** (not synced via IPC)
- [ ] **Manual cleanup instead of cleanup functions**
- [ ] **Reactive proxies passed to IPC** (should serialize first)

### Low (Tech Debt)
- [ ] **Inconsistent `id` vs `tabId` field names** in IPC payloads
- [ ] **Anonymous functions in listeners** (can't remove later)
- [ ] **Missing TypeScript types** for lifecycle methods

---

## 2. Refactoring Recipe: Component IPC Listeners

### Problem
Component adds IPC listener in `onMount` but doesn't clean up in `onDestroy`, causing:
- Memory leaks (listeners accumulate)
- Bugs (old component instances still react to events)

### Detection
```bash
# Find components with listeners but no cleanup
rg "window\.electron\.on" src/ui/components/ -A 5 | grep -v "onDestroy"
```

### Before (Bad)
```svelte
<script>
  import { onMount } from 'svelte';

  let { tabId } = $props();

  onMount(() => {
    window.electron.onTabUpdate((data) => {
      if (data.id === tabId) {
        // Handle update
      }
    });
    // ❌ No cleanup!
  });
</script>
```

### After (Good)
```svelte
<script>
  import { onMount, onDestroy } from 'svelte';

  let { tabId } = $props();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) {
        // Handle update
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>
```

### OR: Use $effect (if listener should re-register on prop change)
```svelte
<script>
  let { tabId } = $props();

  $effect(() => {
    // Re-runs when tabId changes
    const unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) {
        // Handle update
      }
    });

    return () => unsubscribe();  // Cleanup before re-run or unmount
  });
</script>
```

### Validation
```typescript
// tests/components/YourComponent.test.ts
test('cleans up listener on unmount', () => {
  const { unmount } = render(YourComponent, { tabId: 'test' });

  const listenersBefore = getActiveListenerCount();
  unmount();
  const listenersAfter = getActiveListenerCount();

  expect(listenersAfter).toBe(listenersBefore - 1);
});
```

---

## 3. Refactoring Recipe: Stale Async Response Guards

### Problem
Rapid tab switching or prop changes cause late-arriving async responses to overwrite current state.

### Detection
Look for `$effect` blocks that:
- Update state from async sources (metadata, fetches)
- Don't check if component still "owns" that data
- No deduplication guard

### Before (Bad)
```svelte
<script>
  let { tabId } = $props();
  let content = $state('');

  const metadata = $derived($activeTabs.get(tabId)?.metadata);

  $effect(() => {
    const response = metadata?.response;
    content = response;  // ❌ What if tabId changed since response arrived?
  });
</script>
```

### After (Good) - Option 1: Deduplication Guard
```svelte
<script>
  let { tabId } = $props();
  let content = $state('');
  let lastAppliedResponse = $state('');

  const metadata = $derived($activeTabs.get(tabId)?.metadata);

  $effect(() => {
    const response = metadata?.response || '';
    if (response && response !== lastAppliedResponse) {
      lastAppliedResponse = response;
      content = response;
    }
  });
</script>
```

### After (Better) - Option 2: Include tabId in Guard
```svelte
<script>
  let { tabId } = $props();
  let content = $state('');
  let lastApplied = $state({ tabId: '', response: '' });

  const metadata = $derived($activeTabs.get(tabId)?.metadata);

  $effect(() => {
    const response = metadata?.response || '';
    if (response && (response !== lastApplied.response || tabId !== lastApplied.tabId)) {
      lastApplied = { tabId, response };
      content = response;
    }
  });
</script>
```

### After (Best) - Option 3: AbortController for Fetches
```svelte
<script>
  let { tabId } = $props();
  let content = $state('');

  $effect(() => {
    const controller = new AbortController();

    fetch(`/api/tab/${tabId}`, { signal: controller.signal })
      .then(res => res.text())
      .then(data => {
        content = data;  // Only sets if not aborted
      })
      .catch(err => {
        if (err.name === 'AbortError') return;  // Ignore aborts
        console.error(err);
      });

    return () => controller.abort();  // Abort if tabId changes or unmount
  });
</script>
```

### Validation
```typescript
test('ignores stale responses after tab switch', async () => {
  const { rerender } = render(YourComponent, { tabId: 'tab1' });

  // Trigger async update for tab1
  window.electron.sendUpdate({ tabId: 'tab1', response: 'Tab 1 content' });

  // Switch to tab2 before tab1 response arrives
  rerender({ tabId: 'tab2' });
  window.electron.sendUpdate({ tabId: 'tab2', response: 'Tab 2 content' });

  await tick();

  // Should show tab2 content, not tab1
  expect(screen.getByText('Tab 2 content')).toBeInTheDocument();
  expect(screen.queryByText('Tab 1 content')).not.toBeInTheDocument();
});
```

---

## 4. Refactoring Recipe: $effect Infinite Loops

### Problem
`$effect` updates state that triggers the same `$effect` again, causing infinite loop.

### Detection
- Dev console shows "Maximum update depth exceeded" or similar
- Component freezes on render
- State updates rapidly in DevTools

### Before (Bad)
```svelte
<script>
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2;  // ❌ Updates state
    count++;              // ❌ Updates state watched by this effect → loop!
  });
</script>
```

### After (Good) - Use $derived Instead
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);  // ✅ Computed, not side effect

  // Separate effect for side effects
  $effect(() => {
    console.log(`Count changed to ${count}`);
    // No state updates here
  });
</script>
```

### Pattern: When to Use $effect vs $derived

| Use Case | Tool | Example |
|----------|------|---------|
| Compute value from state | `$derived` | `const doubled = $derived(count * 2)` |
| Logging, analytics | `$effect` | `$effect(() => console.log(count))` |
| DOM manipulation | `$effect` | `$effect(() => element.scrollIntoView())` |
| IPC send (without response) | `$effect` | `$effect(() => window.electron.log(count))` |
| Update local state from store | `$derived` | `const tab = $derived($activeTabs.get(id))` |
| Add/remove listeners | `$effect` (with cleanup) | See recipe 2 |

**Golden Rule:** If you're computing a value, use `$derived`. If you're doing something (side effect), use `$effect`.

### Validation
```typescript
test('does not cause infinite loop', () => {
  const consoleError = vi.spyOn(console, 'error');

  render(YourComponent);

  // Wait for any async effects
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(consoleError).not.toHaveBeenCalledWith(
    expect.stringContaining('Maximum update depth')
  );
});
```

---

## 5. Refactoring Recipe: Cleanup Before Deletion

### Problem
Resources deleted from registry before detaching/destroying, causing:
- Errors when cleanup code tries to access deleted resource
- Dangling references in child systems

### Detection
Look for:
- `Map.delete()` before cleanup steps
- Errors in logs like "Cannot read property 'foo' of undefined" during tab close

### Before (Bad)
```typescript
async closeTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);
  if (!tab) return;

  // ❌ Delete first
  this.tabs.delete(tabId);

  // ❌ Cleanup after (may fail if it needs tab reference)
  if (tab.view) {
    this.window.contentView.removeChildView(tab.view);
  }

  this.windowRegistry.removeTab(tabId);  // ❌ May need tab.windowId from Map
  this.tempFileService.cleanupForTab(tabId);
}
```

### After (Good)
```typescript
async closeTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);
  if (!tab) return;

  // ✅ Get references first
  const windowId = tab.windowId;
  const context = this.windowRegistry.getWindowContext(windowId);

  // ✅ Detach from parent
  if (tab.view) {
    try {
      context.window.contentView.removeChildView(tab.view);
    } catch (error) {
      this.logger.warn(`Failed to remove view for tab ${tabId}`, error);
    }
  }

  // ✅ Clean external resources
  this.tempFileService.cleanupForTab(tabId);

  // ✅ Remove cross-references
  this.windowRegistry.removeTab(tabId);

  // ✅ Delete from Map (last step)
  this.tabs.delete(tabId);

  // ✅ Handle derived state
  if (context.activeTabId === tabId) {
    await this.setActiveTab(newActiveTabId, windowId);
  }

  // ✅ Notify Renderer
  this.sendToRenderer('tab-closed', { id: tabId }, windowId);

  // ✅ Persist
  await this.sessionManager.saveSession();
}
```

### Cleanup Order Checklist
1. [ ] Get all references needed for cleanup (before deleting from Map)
2. [ ] Detach from parent containers (Views from Windows)
3. [ ] Clean external resources (files, network, timers)
4. [ ] Remove cross-references (registries, indexes)
5. [ ] Delete from primary storage (Maps, arrays)
6. [ ] Update derived state (active tab, selections)
7. [ ] Broadcast changes (IPC, events)
8. [ ] Persist state (session save)

### Validation
```typescript
test('cleanup completes without errors', async () => {
  const tabId = await window.electron.openUrl('https://example.com');

  const consoleWarn = vi.spyOn(console, 'warn');

  await window.electron.closeTab(tabId);

  // Should not log any errors about missing references
  expect(consoleWarn).not.toHaveBeenCalledWith(
    expect.stringContaining('undefined')
  );

  // Verify all cleanup happened
  expect(await getTempFilesForTab(tabId)).toHaveLength(0);
  expect(await getTabFromRegistry(tabId)).toBeNull();
});
```

---

## 6. Validation Checklist

After refactoring, validate using these tests:

### Memory Leak Test
```bash
# Manual
1. Open DevTools → Memory tab
2. Take heap snapshot (baseline)
3. Perform action 20 times (e.g., open/close tab)
4. Take heap snapshot (final)
5. Compare: final should be ≈ baseline (±10%)
```

```typescript
// Automated (pseudo-code)
test('no memory leak after N operations', async () => {
  const baseline = await getHeapSize();

  for (let i = 0; i < 20; i++) {
    const tab = await window.electron.openUrl('https://example.com');
    await window.electron.closeTab(tab);
  }

  await forceGC();
  const final = await getHeapSize();

  expect(final).toBeLessThan(baseline * 1.1);  // Within 10% of baseline
});
```

### Listener Leak Test
```typescript
test('listener count returns to baseline', () => {
  const baseline = getActiveListenerCount();

  const { unmount } = render(YourComponent, { tabId: 'test' });
  const withComponent = getActiveListenerCount();
  expect(withComponent).toBeGreaterThan(baseline);  // Added listeners

  unmount();
  const afterUnmount = getActiveListenerCount();
  expect(afterUnmount).toBe(baseline);  // Removed listeners
});
```

### Race Condition Test
```typescript
test('rapid state changes show correct final state', async () => {
  const { rerender } = render(YourComponent, { tabId: 'tab1' });

  // Trigger competing updates
  for (let i = 1; i <= 5; i++) {
    rerender({ tabId: `tab${i}` });
    window.electron.sendUpdate({ tabId: `tab${i}`, data: `Data ${i}` });
  }

  await tick();
  await new Promise(resolve => setTimeout(resolve, 100));

  // Should show data for final tab, not any intermediate one
  expect(screen.getByText('Data 5')).toBeInTheDocument();
});
```

### Integration Test
```typescript
test('full lifecycle: create → update → close', async () => {
  const tab = await window.electron.openUrl('https://example.com');

  // Verify created
  expect($activeTabs.get(tab)).toBeDefined();
  expect(await getTempFilesForTab(tab)).toHaveLength(0);  // No temp files for URL tab

  // Update
  await window.electron.updateTab(tab, { title: 'New Title' });
  expect($activeTabs.get(tab).title).toBe('New Title');

  // Close
  await window.electron.closeTab(tab);
  expect($activeTabs.get(tab)).toBeUndefined();
  expect(await getTabFromRegistry(tab)).toBeNull();
});
```

---

## 7. Common Refactoring Patterns

### Pattern: Convert Manual Cleanup to Cleanup Function

**Before:**
```svelte
<script>
  let listener: any = null;

  onMount(() => {
    listener = window.electron.onTabUpdate((data) => { /* ... */ });
  });

  onDestroy(() => {
    if (listener) {
      window.electron.removeListener(listener);  // Manual removal
    }
  });
</script>
```

**After:**
```svelte
<script>
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabUpdate((data) => { /* ... */ });
    // window.electron.onTabUpdate returns cleanup function
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();  // Call cleanup function
  });
</script>
```

---

### Pattern: Consolidate Related $effects

**Before:**
```svelte
<script>
  let count = $state(0);
  let doubled = $state(0);
  let tripled = $state(0);

  $effect(() => {
    doubled = count * 2;
  });

  $effect(() => {
    tripled = count * 3;
  });
</script>
```

**After:**
```svelte
<script>
  let count = $state(0);

  let doubled = $derived(count * 2);
  let tripled = $derived(count * 3);

  // If you need side effects, consolidate:
  $effect(() => {
    console.log(`Count: ${count}, Doubled: ${doubled}, Tripled: ${tripled}`);
  });
</script>
```

---

### Pattern: Extract Lifecycle Logic to Composables

**Before:** Repeated lifecycle logic in multiple components
```svelte
<!-- ComponentA.svelte -->
<script>
  let { tabId } = $props();
  let unsub = null;

  onMount(() => {
    unsub = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) { /* handle */ }
    });
  });

  onDestroy(() => { if (unsub) unsub(); });
</script>

<!-- ComponentB.svelte -->
<script>
  // Same pattern repeated
</script>
```

**After:** Extract to composable function
```typescript
// src/ui/lib/composables/useTabUpdate.ts
export function useTabUpdate(
  tabId: Readable<string>,
  callback: (data: TabUpdateData) => void
): void {
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === get(tabId)) {
        callback(data);
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
}
```

```svelte
<!-- ComponentA.svelte -->
<script>
  import { useTabUpdate } from '$lib/composables/useTabUpdate';

  let { tabId } = $props();

  useTabUpdate(tabId, (data) => {
    // Handle update
  });
</script>
```

---

## 8. Code Review Checklist

Use this checklist when reviewing PRs:

### Resource Management
- [ ] Every resource allocation has corresponding cleanup
- [ ] Cleanup happens in reverse order of allocation
- [ ] Cleanup is defensive (try-catch, null checks)
- [ ] Maps/Sets deleted after cleanup, not before

### IPC Listeners
- [ ] Component listeners return cleanup function or use $effect with return
- [ ] App-lifetime listeners in `electron-listeners.ts`, not components
- [ ] Listeners filter by `tabId` before expensive operations
- [ ] No anonymous functions in listeners (unless cleanup returned)

### Svelte Runes
- [ ] `$state` for local reactive variables
- [ ] `$derived` for computed values (not `$effect`)
- [ ] `$effect` only for side effects, returns cleanup if needed
- [ ] No infinite loops (`$effect` updating state it watches)
- [ ] Guard variables for async/stale data

### Type Safety
- [ ] IPC payloads match TypeScript types
- [ ] No `any` types in lifecycle methods
- [ ] Proper null checks before accessing nested properties

### Testing
- [ ] Unit test for component mount/unmount
- [ ] Integration test for full lifecycle (create → update → destroy)
- [ ] No leaked listeners after test cleanup
- [ ] Memory usage reasonable (heap snapshots if large changes)

---

## 9. Measuring Impact

After refactoring, measure improvement:

### Metrics to Track

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Heap size after 50 tab cycles | _____ MB | _____ MB | < 10% growth |
| Active listener count (baseline) | _____ | _____ | Same as baseline |
| Time to close 20 tabs | _____ ms | _____ ms | < 100ms |
| Errors in logs (1 hour usage) | _____ | _____ | 0 |

### How to Measure

```bash
# Heap size
1. Open DevTools → Memory
2. Take snapshot after app start (baseline)
3. Open 50 tabs → close all → force GC
4. Take snapshot (final)
5. Compare retained size

# Listener count
1. Open DevTools → Console
2. Run: console.log(process._getActiveHandles().length)
3. Note count after app start
4. Perform actions
5. Re-run command, compare

# Time to close tabs
1. Open DevTools → Performance
2. Start recording
3. Close 20 tabs
4. Stop recording
5. Measure time from first close to last 'tab-closed' event

# Error rate
1. Run app with debug logging enabled
2. Use normally for 1 hour
3. Count errors in logs: grep "ERROR\|WARN" logs.txt | wc -l
```

---

## 10. Next Steps

After refactoring:

1. **Update Design Docs**
   - Add new patterns discovered to `RESOURCE_LIFECYCLE_DESIGN.md`
   - Update ownership table if new resources added
   - Document any new anti-patterns found

2. **Add Regression Tests**
   - Write tests for fixed bugs
   - Add to CI pipeline

3. **Share Knowledge**
   - Document in PR description: "Refactored X following RESOURCE_LIFECYCLE_DESIGN.md section Y"
   - Add code comments linking to design docs

4. **Monitor in Production**
   - Watch for errors related to refactored code
   - Check performance metrics weekly
   - Schedule follow-up review in 2 weeks

---

## Quick Reference Commands

```bash
# Find components with listeners but no cleanup
rg "window\.electron\.on" src/ui/components/ -A 10 | grep -v "onDestroy"

# Find $effects without cleanup returns
rg "\$effect\(\(\) => \{" src/ui/ -A 20 | grep -v "return \(\)"

# Find Map.delete before cleanup (anti-pattern)
rg "\.delete\(" src/main/ -B 5 -A 5

# Find store mutations without update/set
rg "\$\w+\.\w+ =" src/ui/ --type svelte

# Find IPC sends in $effects (potential loops)
rg "\$effect.*window\.electron" src/ui/ -A 5
```
