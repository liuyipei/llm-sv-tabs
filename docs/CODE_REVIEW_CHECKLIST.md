# Code Review Checklist: Resource Lifecycle

**Purpose:** Quick reference for PR reviews and daily development.

**How to use:**
- For PRs: Reviewer checks relevant sections based on files changed
- For self-review: Author checks before pushing
- For refactoring: Use as validation after changes

---

## 1. General Resource Management

### New Resource Created (Map, Set, Array, Object)
- [ ] Clear owner identified (Main or Renderer?)
- [ ] Cleanup path exists (when is it destroyed?)
- [ ] Added to ownership table in `RESOURCE_LIFECYCLE_DESIGN.md`
- [ ] Cleanup happens before deletion from registry
- [ ] Try-catch around cleanup for graceful failure

**Example Review Comment:**
```
This adds a new `Map<string, Connection>` but I don't see where connections
are cleaned up. Should this be in closeTab() or a separate cleanup method?

See: docs/RESOURCE_LIFECYCLE_DESIGN.md#explicit-ownership
```

---

## 2. Main Process Changes

### New Tab Creation Path
- [ ] Uses `createTabId()` for unique ID
- [ ] Adds to `tabs` Map before IPC broadcast
- [ ] Registers with `WindowRegistry.setTabOwner()`
- [ ] Sends `tab-created` IPC event to Renderer
- [ ] Session save triggered if needed

**Red Flags:**
- Creating tab without adding to Map
- Broadcasting before Main state updated
- Missing WindowRegistry registration

### Tab Cleanup Path
- [ ] Gets tab reference **before** deleting from Map
- [ ] Removes WebContentsView from window (if exists)
- [ ] Calls `tempFileService.cleanupForTab(tabId)`
- [ ] Removes from WindowRegistry
- [ ] Deletes from tabs Map (last step)
- [ ] Handles active tab switch if needed
- [ ] Sends `tab-closed` IPC event
- [ ] Saves session

**Red Flags:**
- Cleanup order reversed (delete before cleanup)
- Missing cleanup steps
- No error handling around cleanup

### IPC Handler Changes
- [ ] Uses `resolveWindowId(event)` to get window context
- [ ] Validates input parameters
- [ ] Returns serializable data (no internal objects)
- [ ] Error handling with meaningful messages
- [ ] Logs important operations

**Example Review Comment:**
```
This handler doesn't call resolveWindowId(), so multi-window support may break.
Use: const windowId = resolveWindowId(event);
```

---

## 3. Renderer Process Changes

### New Svelte Component
- [ ] Props typed with `$props()` (Svelte 5)
- [ ] Local state uses `$state`
- [ ] Computed values use `$derived` (not `$effect`)
- [ ] Side effects in `$effect` with cleanup return (if needed)
- [ ] IPC listeners cleaned up in `onDestroy()`
- [ ] Store subscriptions cleaned up (or use auto-subscribe `$storeName`)

**Red Flags:**
- `$effect` computing values (should be `$derived`)
- `$effect` without cleanup return when adding listeners
- Store mutations outside of store methods

### Modified Existing Component
- [ ] No new listeners without cleanup
- [ ] No new `$effect` blocks without reviewing for loops
- [ ] No state updates that could trigger infinite reactivity
- [ ] No reactive proxies passed to IPC

**Example Review Comment:**
```
This $effect updates `count` which is watched by the same effect.
This will cause an infinite loop.

Move the computation to $derived or add a guard condition.
See: docs/REFACTORING_GUIDE.md#4-refactoring-recipe-effect-infinite-loops
```

---

## 4. IPC Listener Changes

### Component-Scoped Listener
- [ ] Added in `onMount` or `$effect`
- [ ] Cleanup function captured: `const unsub = window.electron.onX(...)`
- [ ] Cleanup called in `onDestroy()` OR returned from `$effect`
- [ ] Filters by relevant ID before processing (e.g., `if (data.tabId === tabId)`)

**Template (Good):**
```svelte
<script>
  let { tabId } = $props();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) {  // ✅ Filter first
        // Handle update
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();  // ✅ Cleanup
  });
</script>
```

**Red Flags:**
- No cleanup function captured
- No `onDestroy` hook
- Processing data before checking if it applies to this component

### App-Scoped Listener
- [ ] Added in `electron-listeners.ts` (not in component)
- [ ] Updates global stores (not component state)
- [ ] No cleanup needed (app-lifetime)

**Red Flags:**
- Global state updated inside component listener
- App-lifetime listener added in component

---

## 5. Svelte 5 Rune Usage

### $state
- [ ] Used for component-local reactive variables
- [ ] Not mutated directly in objects (use spread: `{ ...obj, key: newValue }`)
- [ ] Not passed to IPC (serialize first)

**Good:**
```svelte
let count = $state(0);
let user = $state({ name: 'Alice', age: 30 });

// Update
user = { ...user, age: 31 };  // ✅ New object
```

**Bad:**
```svelte
user.age = 31;  // ❌ Direct mutation may not trigger reactivity
window.electron.sendData(user);  // ❌ May send Proxy object
```

### $derived
- [ ] Used for computed values (not `$effect`)
- [ ] Pure function (no side effects)
- [ ] Uses `$derived.by()` for complex computations

**Good:**
```svelte
const doubled = $derived(count * 2);
const sorted = $derived.by(() => items.slice().sort());
```

**Bad:**
```svelte
$effect(() => {
  doubled = count * 2;  // ❌ Should be $derived
});
```

### $effect
- [ ] Used only for side effects (logging, DOM, IPC, listeners)
- [ ] Returns cleanup function if creates resources
- [ ] No state updates that trigger same effect (infinite loop)
- [ ] Has guard conditions for conditional execution

**Good:**
```svelte
$effect(() => {
  console.log(`Count is now ${count}`);  // ✅ Side effect, no cleanup needed
});

$effect(() => {
  const unsub = window.electron.onEvent(() => { /* ... */ });
  return () => unsub();  // ✅ Cleanup returned
});
```

**Bad:**
```svelte
$effect(() => {
  count++;  // ❌ Updates state watched by this effect → infinite loop
});

$effect(() => {
  window.electron.onEvent(() => { /* ... */ });  // ❌ No cleanup returned
});
```

---

## 6. Concurrency & Race Conditions

### Async State Updates
- [ ] Guard variable to prevent stale updates
- [ ] Checks if component still "owns" the data (e.g., `tabId` matches)
- [ ] Uses `AbortController` for cancellable operations tied to tab/component

**Pattern:**
```svelte
<script>
  let { tabId } = $props();
  let lastApplied = $state({ tabId: '', data: '' });

  $effect(() => {
    const data = metadata?.data || '';
    if (data && (data !== lastApplied.data || tabId !== lastApplied.tabId)) {
      lastApplied = { tabId, data };
      // Process data
    }
  });
</script>
```

**Red Flags:**
- No guard against stale data
- Async updates without checking if component/tab changed
- Long-running fetches without abort mechanism

---

## 7. Memory & Performance

### Large Data Handling
- [ ] PDFs use temp files (not in-memory base64)
- [ ] Temp files cleaned up on tab close
- [ ] Large strings not duplicated across Main and Renderer
- [ ] Virtualization for long lists (if applicable)

**Check:**
```typescript
// In closeTab():
this.tempFileService.cleanupForTab(tabId);  // ✅ Should exist
```

### Tab List Rendering
- [ ] Uses `{#each items as item (item.id)}` with key
- [ ] Not using array index as key
- [ ] Not re-rendering all tabs when one updates

**Good:**
```svelte
{#each $sortedTabs as tab (tab.id)}
  <TabItem {tab} />
{/each}
```

**Bad:**
```svelte
{#each $sortedTabs as tab, i (i)}  {/* ❌ Index as key */}
  <TabItem {tab} />
{/each}
```

---

## 8. Error Handling

### Main Process
- [ ] Try-catch around cleanup operations
- [ ] Errors logged with context (tabId, windowId)
- [ ] Failed cleanup doesn't prevent rest of cleanup
- [ ] User-facing errors sent to Renderer for UI display

**Pattern:**
```typescript
try {
  context.window.contentView.removeChildView(tab.view);
} catch (error) {
  this.logger.warn(`Failed to remove view for tab ${tabId}:`, error);
  // Continue with rest of cleanup
}
```

### Renderer
- [ ] IPC errors handled with user feedback
- [ ] Async errors caught and logged
- [ ] Errors don't break reactivity

---

## 9. Testing

### Unit Tests
- [ ] Component mount/unmount tested
- [ ] Listener cleanup verified (count before/after)
- [ ] State updates trigger expected re-renders
- [ ] Edge cases covered (null, undefined, empty)

### Integration Tests
- [ ] Full lifecycle tested (create → update → destroy)
- [ ] Multi-window scenarios if relevant
- [ ] Race conditions tested (rapid state changes)

**Minimum Tests for New Features:**
```typescript
// Component
test('renders with valid props', () => { /* ... */ });
test('cleans up listeners on unmount', () => { /* ... */ });

// Main process
test('creates resource correctly', () => { /* ... */ });
test('cleans up all resources on destroy', () => { /* ... */ });
test('handles errors gracefully', () => { /* ... */ });
```

---

## 10. Documentation

### Code Comments
- [ ] Complex cleanup sequences have step-by-step comments
- [ ] Link to design docs for lifecycle patterns
- [ ] TODOs tracked in issues (not just comments)

**Example:**
```typescript
/**
 * Closes a tab and cleans up all associated resources.
 *
 * Lifecycle: See docs/RESOURCE_LIFECYCLE_DESIGN.md#tab-destruction-flow
 *
 * @param tabId - Unique tab identifier
 * @param windowId - Optional window context (resolved from registry if omitted)
 */
async closeTab(tabId: string, windowId?: WindowId): Promise<void> {
  // Implementation...
}
```

### Design Doc Updates
- [ ] New resources added to ownership table
- [ ] New patterns documented in RESOURCE_LIFECYCLE_DESIGN.md
- [ ] New anti-patterns documented in REFACTORING_GUIDE.md

---

## Quick Checks by File Type

### *.ts (Main Process)
```bash
# Check cleanup order
rg "\.delete\(" -A 5 -B 5

# Check error handling
rg "try \{" -A 3 | grep -v "catch"

# Check IPC handlers use resolveWindowId
rg "ipcMain\.handle" -A 3 | grep -v "resolveWindowId"
```

### *.svelte (Components)
```bash
# Check listeners have cleanup
rg "window\.electron\.on" -A 10 | grep -v "onDestroy\|return \(\)"

# Check $effect infinite loops
rg "\$effect.*\$state" -A 5

# Check proper key usage in loops
rg "#each.*as \w+ \(" -v
```

### *.ts (Stores)
```bash
# Check store mutations are via update/set
rg "\.subscribe\(" -A 10 | grep "= "

# Check no stores holding large objects
rg "Writable<.*\[\]>" | rg ">\[>1000\]"
```

---

## Severity Guidelines

### 🔴 CRITICAL - Block merge
- Memory leak (listener not cleaned up)
- Data loss (no session save after critical operation)
- Security issue (XSS, injection, exposed secrets)
- Crash (unhandled error in Main process)

### 🟡 HIGH - Request changes
- Race condition (stale data, no guard)
- Missing cleanup step (temp files, registry)
- Infinite loop ($effect updating watched state)
- No error handling in cleanup

### 🟢 MEDIUM - Suggest improvement
- Inconsistent patterns (could follow design docs better)
- Missing tests for new feature
- Performance concern (not optimized)
- Documentation incomplete

### ⚪ LOW - Nitpick
- Code style (prefer const over let)
- Naming (could be more descriptive)
- Minor refactoring opportunity

---

## Example PR Review

**Files Changed:**
- `src/main/tab-manager.ts`: Added `duplicateTab()` method
- `src/ui/components/TabItem.svelte`: Added duplicate button

**Review:**

```markdown
## tab-manager.ts

### 🟡 HIGH: Missing temp file handling
Line 234: When duplicating a tab with temp files (PDF, image), the new tab
references the same file. If original tab closes, file is deleted and
duplicate tab breaks.

**Fix:** Copy temp file for new tab:
```typescript
if (sourceTab.tempFilePath) {
  newTab.tempFilePath = await this.tempFileService.copyFile(
    sourceTab.tempFilePath,
    newTabId
  );
}
```

### 🟢 MEDIUM: Add to session save
Line 245: `duplicateTab()` doesn't trigger `sessionManager.saveSession()`.
New tab won't persist if app crashes before next auto-save.

**Fix:** Add `await this.sessionManager.saveSession();` before return.

## TabItem.svelte

### 🔴 CRITICAL: No listener cleanup
Line 42: `window.electron.onTabUpdate()` added in `onMount` but never cleaned up.

**Fix:**
```svelte
let unsubscribe: (() => void) | null = null;

onMount(() => {
  unsubscribe = window.electron.onTabUpdate((data) => { /* ... */ });
});

onDestroy(() => {
  if (unsubscribe) unsubscribe();
});
```

See: docs/REFACTORING_GUIDE.md#2-refactoring-recipe-component-ipc-listeners

### ⚪ LOW: Consider extracted composable
This tab update listener pattern is used in 3+ components. Consider
extracting to `useTabUpdate()` composable.

See: docs/REFACTORING_GUIDE.md#pattern-extract-lifecycle-logic-to-composables

## Tests

### 🟡 HIGH: Missing cleanup test
No test verifying temp file cleanup when duplicated tab is closed.

**Add:**
```typescript
test('closes duplicated tab without affecting original', async () => {
  const original = await openPDFTab();
  const duplicate = await duplicateTab(original);

  await closeTab(duplicate);

  expect(await getTempFile(original)).toExist();
  expect(await getTempFile(duplicate)).not.toExist();
});
```
```

---

## Final Checklist (Before Approving PR)

- [ ] No memory leaks (listeners, subscriptions, resources)
- [ ] No race conditions (guards, AbortControllers)
- [ ] No infinite loops ($effect patterns reviewed)
- [ ] Cleanup happens before deletion
- [ ] Error handling in place
- [ ] Tests cover new code paths
- [ ] Design docs updated if new patterns introduced
- [ ] No critical or high severity issues unresolved

**Approve if:**
- All critical/high issues addressed
- Tests pass
- Follows established patterns from design docs

**Request changes if:**
- Critical or high severity issues present
- Missing tests for new features
- Introduces memory leaks or race conditions
