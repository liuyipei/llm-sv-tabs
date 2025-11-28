# The "Round-Trip" Test Pattern

## Overview

**Pattern Name:** State Persistence Through Navigation (aka "Round-Trip Test")

**What it catches:** Components that forget to load data when remounting

**Bug it prevents:** "Conversation/data disappears when I navigate away and back"

## The Pattern

```
1. CREATE state with data
2. NAVIGATE AWAY (unmount component)
3. NAVIGATE BACK (remount component)
4. ASSERT data is still visible
```

## Why This Matters

This is the **#1 most common bug in component-based UIs** because developers naturally test the happy path:

✅ **What developers test:**
- Create the feature
- Use the feature while it's on screen
- "It works!"

❌ **What developers forget:**
- Navigate away
- Come back later
- Does it still work?

## Real-World Example: The Conversation Loss Bug

### The Bug
- User sends query to LLM
- Conversation streams in, looks perfect
- User switches to another tab
- User switches back
- **Conversation is GONE** ❌

### Why It Happened
The developer only tested:
```javascript
onMount(() => {
  // Subscribe to NEW streaming chunks
  subscribeToChunks((chunk) => {
    text += chunk;  // Works great for new data!
  });
});
```

They forgot:
```javascript
onMount(() => {
  // Load EXISTING data first!
  if (existingData) {
    text = existingData;
  }

  // THEN subscribe to new chunks
  subscribeToChunks(/*...*/);
});
```

### The Test That Catches It

```javascript
it('should display conversation after unmount/remount', () => {
  // 1. CREATE: Set up tab with existing conversation
  const tab = {
    metadata: {
      response: 'Existing conversation text',
      isStreaming: false,
    },
  };
  activeTabs.set(new Map([[tabId, tab]]));

  // 2. MOUNT: First visit
  const { getByText, unmount } = render(MessageStream, {
    props: { tabId },
  });
  expect(getByText('Existing conversation')).toBeTruthy(); // ✅ Works

  // 3. UNMOUNT: Navigate away
  unmount();

  // 4. REMOUNT: Navigate back
  const { getByText: getByText2 } = render(MessageStream, {
    props: { tabId },
  });

  // 5. ASSERT: Should STILL work
  expect(getByText2('Existing conversation')).toBeTruthy(); // ❌ BUG HERE!
});
```

## When to Use This Pattern

Use this test whenever:

1. **Component displays persisted data**
   - Conversations, documents, forms, etc.
   - Data that should survive navigation

2. **Component can unmount/remount**
   - Tab-based UIs
   - Router navigation
   - Modal dialogs
   - Conditional rendering

3. **State lives outside the component**
   - Redux/Zustand/Svelte stores
   - Database/API
   - URL parameters
   - localStorage

## Test Template

```javascript
describe('Round-Trip: Navigation Persistence', () => {
  it('should preserve [DATA] after unmount/remount', () => {
    // 1. SETUP: Create persisted state
    persistedStore.set({ data: 'important data' });

    // 2. MOUNT: First render
    const { getByText, unmount } = render(Component);
    expect(getByText('important data')).toBeTruthy();

    // 3. UNMOUNT: Simulate navigation away
    unmount();

    // 4. REMOUNT: Simulate navigation back
    const { getByText: getByText2 } = render(Component);

    // 5. ASSERT: Data should persist
    expect(getByText2('important data')).toBeTruthy();
  });
});
```

## Common Variations

### Multi-Tab Switching
```javascript
it('should preserve data when switching between tabs', () => {
  // Set up multiple tabs with data
  const tabs = [
    { id: '1', data: 'First' },
    { id: '2', data: 'Second' },
  ];

  // Render first tab
  const { getByText: get1, unmount: unmount1 } = render(Component, { tabId: '1' });
  expect(get1('First')).toBeTruthy();

  // Switch to second tab
  unmount1();
  const { getByText: get2, unmount: unmount2 } = render(Component, { tabId: '2' });
  expect(get2('Second')).toBeTruthy();

  // Switch BACK to first tab
  unmount2();
  const { getByText: get3 } = render(Component, { tabId: '1' });
  expect(get3('First')).toBeTruthy(); // Must still be there!
});
```

### App Restart (Full Persistence)
```javascript
it('should restore data after app restart', () => {
  // 1. User creates data
  createData('important');

  // 2. App saves to persistent storage
  saveToLocalStorage();

  // 3. Simulate app restart (clear in-memory state)
  clearInMemoryState();

  // 4. App loads from persistent storage
  loadFromLocalStorage();

  // 5. Render component
  const { getByText } = render(Component);

  // 6. Data should be restored
  expect(getByText('important')).toBeTruthy();
});
```

## Anti-Patterns (What NOT to Do)

### ❌ Only test while mounted
```javascript
// BAD: Doesn't catch persistence bugs
it('should display data', () => {
  const { getByText } = render(Component);
  expect(getByText('data')).toBeTruthy();
  // Component never unmounts, so we don't test persistence!
});
```

### ❌ Test in isolation without persistent state
```javascript
// BAD: Uses local state instead of real persistence layer
it('should display data', () => {
  const fakeData = 'data'; // This isn't how real app works!
  const { getByText } = render(Component, { props: { data: fakeData } });
  expect(getByText('data')).toBeTruthy();
});
```

## Checklist for Code Reviews

When reviewing components that display persisted data, ask:

- [ ] Does the component load existing data in `onMount`?
- [ ] Is there a round-trip test?
- [ ] Does the test use the REAL persistence layer (store/API)?
- [ ] Does the component handle both "new data" AND "existing data"?

## Related Patterns

1. **Optimistic UI**: Update immediately, persist in background
2. **Stale While Revalidate**: Show cached data, fetch fresh in background
3. **Progressive Enhancement**: Work with partial data while loading complete data

## Summary

**The Minimal Test:**
```
Create → Unmount → Remount → Assert
```

**What it catches:**
- Forgetting to load persisted data
- Only handling "new data" but not "existing data"
- State initialization bugs

**When to use it:**
- Tab-based UIs
- Router navigation
- Any component that displays persisted data

**The key insight:**
> "If you only test the component while it stays mounted,
> you'll never catch persistence bugs."

## See Also

- `/tests/components/MessageStream.test.js` - Concrete example
- `/tests/stores/bookmarks.test.ts` - Persistence testing for stores
- Bug report: "Conversation loss on tab navigation" (Issue #XXX)
