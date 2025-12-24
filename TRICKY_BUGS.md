# Tricky Bugs Encountered During Migration

## Bug #1: Svelte 5 Component Mounting API Change

### Symptoms
- Error: `Uncaught TypeError: Cannot read properties of undefined (reading 'call')`
- Stack trace: `at get_first_child (operations.js:90:28)`
- UI components completely failed to render
- Error occurred even with minimal "hello world" component
- Preload script and IPC bridge initialized successfully, but UI never appeared

### Root Cause
**Using Svelte 4 component mounting syntax with Svelte 5.**

Svelte 5 completely rewrote the component instantiation system. The constructor-based approach (`new Component()`) from Svelte 4 no longer works.

### The Fix

**Before (Svelte 4 syntax):**
```javascript
// src/ui/main.js
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app'),
});
```

**After (Svelte 5 syntax):**
```javascript
// src/ui/main.js
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app'),
});
```

### Why This Was Tricky

1. **The error message was misleading**: It pointed to Svelte's internal rendering code, not the mounting code
2. **The error occurred deep in Svelte internals**: `get_first_child` in `operations.js` made it seem like a DOM issue
3. **Multiple red herrings**: We initially suspected:
   - Store subscription patterns
   - Custom store implementation (monkey-patching)
   - IPC bridge initialization timing
   - Child component issues
   - TypeScript compilation problems
4. **Even minimal components failed**: A component with just `<h1>Hello</h1>` crashed the same way
5. **The mounting code looked "normal"**: The `new Component({ target })` pattern was valid in Svelte 4

### Debugging Process

We used a binary search approach, progressively simplifying the code:

1. **Started with**: Full app with stores, IPC, child components → Failed
2. **Removed**: Store usage in templates → Failed
3. **Removed**: All child components → Failed
4. **Removed**: All imports and TypeScript → Failed
5. **Finally checked**: The mounting code itself → **FOUND IT**

### Key Lesson

**When migrating between major framework versions, check the entry point first!**

The mounting/bootstrapping code is often overlooked because it's a small file that "just works." But major version changes often modify these foundational APIs.

### Related Svelte 5 Breaking Changes

This is part of Svelte 5's major rewrite. Other breaking changes to watch for:

- Component instantiation: `new Component()` → `mount(Component, options)`
- Reactive statements: `$:` → `$derived` or `$effect`
- Event handlers: `on:click` → `onclick`
- Props: `export let` → can use `$props()` (though `export let` still works)
- Stores: Subscriptions work differently internally (avoid subscribing during module init)

### Prevention

For future major version migrations:

1. **Start with the docs**: Read the migration guide first
2. **Check entry points**: Verify main.js, mounting code, and bootstrapping
3. **Enable source maps**: Set `sourcemap: true` and `minify: false` during debugging
4. **Test incrementally**: Start with minimal component, add features one by one
5. **Watch for constructor patterns**: Major frameworks often change how objects are instantiated

### References

- [Svelte 5 Migration Guide](https://svelte-5-preview.vercel.app/docs/breaking-changes)
- [Svelte 5 mount() API](https://svelte.dev/docs/svelte/imperative-component-api#mount)
- Error occurred in: Svelte 5.43.8, Electron 39.2.2, Vite 7.2.2

---

## Bug #2: Store Monkey-Patching (Attempted Fix - Wrong Approach)

### Symptoms
Same as Bug #1 (because we tried fixing stores before finding the real issue)

### What We Tried
We attempted to fix persisted stores by overriding `set` and `update` methods:

```typescript
const store = writable<T>(initialValue);
const originalSet = store.set;

store.set = function(value: T) {  // ❌ Doesn't work reliably in Svelte 5
  localStorage.setItem(key, JSON.stringify(value));
  return originalSet.call(this, value);
};
```

### Why It Failed
Svelte 5's internal store implementation changed. Monkey-patching the methods broke the `this` context.

### The Correct Approach
Use the **custom store pattern** (destructure and return new object):

```typescript
function createPersistedStore<T>(key: string, initial: T): Writable<T> {
  const { subscribe, set, update } = writable<T>(initialValue);

  return {
    subscribe,
    set: (value: T) => {
      localStorage.setItem(key, JSON.stringify(value));
      set(value);
    },
    update: (fn) => {
      update((current) => {
        const newValue = fn(current);
        localStorage.setItem(key, JSON.stringify(newValue));
        return newValue;
      });
    }
  };
}
```

### Note
This wasn't the actual bug causing rendering failure, but it's worth documenting as a pattern to avoid.

---

## Bug #3: Component Reuse with Boolean Initialization Guards

### Symptoms
- Switching between tabs of the same type (e.g., Notes → Notes) fails to update the UI
- The component shows stale content from the previous tab
- First tab switch works, but subsequent switches to the same component type show old data
- Other transition types work correctly (Notes → Webpage, Notes → LLM Response, etc.)
- Bug specific to **component reuse** scenarios

### Example Bug
Found in `NoteEditor.svelte` (fixed in commit `92faddc`):

```javascript
// ❌ BUGGY: Boolean initialization guard
let title = $state('');
let content = $state('');
let isInitialized = $state(false);

$effect(() => {
  if (tab && !isInitialized) {  // ❌ Only runs once!
    title = tab.title || '';
    content = tab.metadata?.noteContent || '';
    isInitialized = true;  // ❌ Never resets when tabId changes
  }
});
```

**What happens:**
1. User switches to Notes Tab A → `isInitialized = false`, content loads ✓
2. `isInitialized` becomes `true`
3. User switches to Notes Tab B → component reused, `isInitialized` still `true` ✗
4. Effect condition `!isInitialized` is false → content never updates ✗
5. UI still shows Notes Tab A's content

### Root Cause

**Component reuse + lifecycle-based guard = stale state**

When Svelte switches between tabs with the **same component type**, it reuses the component instance rather than destroying and recreating it. The `isInitialized` flag persists across tab switches, blocking re-initialization.

### The Fix

**Track the data source, not initialization state:**

```javascript
// ✅ CORRECT: Track current tabId
let title = $state('');
let content = $state('');
let currentTabId = $state<string | undefined>(undefined);

$effect(() => {
  // When tabId changes (switching tabs), reload content
  if (tabId !== currentTabId) {  // ✅ Detects tab change
    currentTabId = tabId;
    if (tab) {
      title = tab.title || '';
      content = tab.metadata?.noteContent || '';
    }
  }
});
```

**What changed:**
- Replaced boolean `isInitialized` with **value tracking** (`currentTabId`)
- Effect condition checks **"Did the source change?"** not **"Have I run before?"**
- Works correctly for all transitions, including component reuse

### Alternative Pattern: Use $derived

For purely reactive data, avoid effects entirely:

```javascript
// ✅ BEST: Fully reactive with $derived
const tab = $derived($activeTabs.get(tabId));
const metadata = $derived(tab?.metadata);
const title = $derived(tab?.title || '');
const content = $derived(metadata?.noteContent || '');

// No effect needed - automatically updates when tabId changes
```

**When to use `$derived` vs effects:**
- **`$derived`**: When you're computing/extracting values (read-only)
- **`$effect`**: When you need side effects or need to update local state

### Why This Was Tricky

1. **Bug only manifests with component reuse**: Notes → Notes, LLM → LLM
2. **Other transitions work fine**: Notes → Webpage, Notes → LLM (different components)
3. **Mental model mismatch**: Developers expect components to "reset" on tab change
4. **The guard pattern seems correct**: "Initialize once" is a common pattern in other frameworks

### Pattern Comparison Table

| Feature | Boolean Flag (Buggy) | Value Tracking (Fixed) |
|---------|---------------------|----------------------|
| **Logic Type** | Lifecycle-based<br/>"Did I run once?" | Data-based<br/>"Did the source change?" |
| **Tab Switching** | ❌ Fails. Shows old data | ✅ Succeeds. Updates on change |
| **Reactivity** | Static after first load | Dynamic, responds to prop changes |
| **Mental Model** | Constructor (run once) | Synchronization (keep in sync) |
| **Svelte 5 Idiom** | Anti-pattern | Best practice |

### When Component Reuse Happens

Svelte reuses components when:
1. **Same component type** in conditional rendering
2. **Props change** but component identity remains
3. **Parent re-renders** but child component type unchanged

Example from `App.svelte`:
```svelte
{#if showNoteEditor && activeTab}
  <NoteEditor tabId={activeTab.id} />  <!-- ⚠️ Reused when switching notes tabs -->
{:else if showSvelteContent && activeTab}
  <MessageStream tabId={activeTab.id} />  <!-- ⚠️ Reused when switching LLM tabs -->
{/if}
```

When user switches from Notes Tab 1 → Notes Tab 2:
- `showNoteEditor` remains `true`
- `NoteEditor` component is **reused**
- Only `tabId` prop changes
- Component must detect the prop change to update

### Prevention Checklist

When writing components that receive tab/item IDs:

- [ ] **Never use boolean initialization guards** (`isInitialized`, `hasLoaded`, `ready`)
- [ ] **Always track the source ID** (compare `tabId !== currentTabId`)
- [ ] **Prefer `$derived`** for reactive values when possible
- [ ] **Test component reuse**: Switch between multiple items of the same type
- [ ] **Watch for this pattern**: `if (data && !hasLoaded)` → ❌ Bug likely!

### Safe Patterns in the Codebase

**MessageStream.svelte** (already correct):
```javascript
// ✅ Uses $derived for reactive data
const tab = $derived($activeTabs.get(tabId));
const metadata = $derived(tab?.metadata);

// ✅ Uses content-based guard, not initialization guard
let lastAppliedMetadataResponse = $state('');
$effect(() => {
  const metadataResponse = metadata?.response || '';
  if (metadataResponse && metadataResponse !== lastAppliedMetadataResponse) {
    fullText = metadataResponse;
    lastAppliedMetadataResponse = metadataResponse;  // ✅ Tracks value, not state
  }
});
```

### Codebase Audit Results

**Components with tabId/itemId props:**
- ✅ `MessageStream.svelte`: Uses `$derived` + content tracking - Safe
- ✅ `NoteEditor.svelte`: Fixed in commit `92faddc` - Safe
- ✅ `ApiKeyInstructionsView.svelte`: No props, static content - Safe
- ✅ `AggregateTabs.svelte`: No tab-specific props - Safe

**Note:** `MessageStream.svelte` has `hasLoadedInitialData` flag but it's **not used as a guard** in effects, only set for internal tracking. Safe but could be removed as dead code.

### Key Lesson

**In Svelte 5 with component reuse: Track what changed, not whether you've run.**

Boolean initialization guards (`isInitialized`) represent a **lifecycle-based mental model** ("Has this component initialized?") which conflicts with Svelte's **reactive mental model** ("What is the current state?").

Use **value tracking** (`currentTabId !== tabId`) or **`$derived`** to stay synchronized with prop changes.

### Related Svelte 5 Patterns

- `$derived`: Reactive computed values that auto-update
- `$effect`: Side effects that re-run when dependencies change
- Component reuse: Svelte optimizes by reusing components when possible

### References

- [Svelte 5 Runes: $derived](https://svelte.dev/docs/svelte/$derived)
- [Svelte 5 Runes: $effect](https://svelte.dev/docs/svelte/$effect)
- Fixed in: `src/ui/components/notes/NoteEditor.svelte` (commit `92faddc`)
- Related: [design/07-store-synchronization-across-processes.md](design/07-store-synchronization-across-processes.md)

---

*Document created: 2025-11-20*
*Last updated: 2025-12-24*
