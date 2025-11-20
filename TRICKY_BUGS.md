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

*Document created: 2025-11-20*
*Last updated: 2025-11-20*
