# Store Synchronization Test Pattern for Electron

## Problem

In multi-process architectures like Electron, state exists in multiple memory spaces:
- **Main process**: Source of truth
- **Renderer process**: Cached copy in reactive store

Updating main process state doesn't automatically update renderer stores. You must explicitly send IPC events.

## Test Pattern

Test that main process mutations properly synchronize to renderer stores:

```javascript
describe('Store Sync: Main Process → Renderer Store', () => {
  it('should sync tab metadata updates from main to renderer', async () => {
    // 1. SETUP: Create tab in main process
    const { tabId } = await mainProcess.createTab();

    // 2. VERIFY: Renderer store has initial state
    const initialTab = rendererStore.getTab(tabId);
    expect(initialTab.metadata.response).toBeUndefined();

    // 3. MUTATE: Update in main process
    await mainProcess.updateTabMetadata(tabId, {
      response: 'New data from main process'
    });

    // 4. ASSERT: Renderer store should be updated
    // Wait for IPC event to propagate
    await waitForStoreUpdate();

    const updatedTab = rendererStore.getTab(tabId);
    expect(updatedTab.metadata.response).toBe('New data from main process');
  });

  it('should sync incremental updates during streaming', async () => {
    const { tabId } = await mainProcess.createStreamingTab();

    // Send 3 chunks
    await mainProcess.sendChunk(tabId, 'chunk 1 ');
    await mainProcess.sendChunk(tabId, 'chunk 2 ');
    await mainProcess.sendChunk(tabId, 'chunk 3');

    // Wait for throttled sync
    await wait(600); // Throttle is 500ms

    // Renderer should have accumulated text
    const tab = rendererStore.getTab(tabId);
    expect(tab.metadata.response).toContain('chunk 1 chunk 2 chunk 3');
  });
});
```

## Key Assertion

**The test fails if:**
- Main process updates state ✓
- IPC event is NOT sent ❌
- Renderer store stays stale ❌
- Test assertion fails: `expected 'new data', got undefined`

**This catches the exact bug we had.**

## Related Patterns

- **Round-Trip Test**: Tests component mount/unmount (single process)
- **Store Sync Test**: Tests process boundary synchronization (multi-process)

Both are needed in Electron apps.
