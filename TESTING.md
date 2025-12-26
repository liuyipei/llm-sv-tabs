# Testing Guide

Fast, modern testing with **Vitest** and **Svelte Testing Library**. Tests run in < 10 seconds.

## Test Structure

```
tests/
├── stores/               # Store unit tests (tabs, config, ui)
├── components/           # Component tests (TabItem, TabList)
├── integration/          # Integration tests (tab workflow)
├── main/                 # Main process tests (TabManager)
├── providers/            # Provider tests (factory, discovery, capabilities)
└── lib/                  # Library tests (ipc-bridge)
```

## Running Tests

```bash
npm test                 # Run all tests (~80 tests, <10s)
npm run test:watch       # Watch mode
npm run test:ui          # With UI
npm run test:coverage    # With coverage
npm run test:smoke       # Smoke test (headless Electron launch)
```

### Smoke Tests (Headless Mode)

Smoke tests verify the app launches correctly in headless mode on all three platforms (Linux, macOS, Windows):

**Timeout Architecture:**
- **15s process timeout**: SIGKILL if app doesn't exit (scripts/start-headless.js)
- **2s success delay**: Cleanup after window loads (smoke-test-exit.ts)
- **500ms shutdown grace**: Force exit in will-quit handler (shutdown-manager.ts)

**Platform Support:**
- **Linux**: xvfb-run (virtual framebuffer) or Ozone headless fallback
- **macOS/Windows**: Offscreen rendering via Electron flags
- **CI**: All platforms run smoke tests with 10-minute job timeouts

**Common Issues:**
- Preload script must be bundled to CommonJS (handled by `npm run bundle:preload`)
- Missing xvfb on Linux: `sudo apt-get install xvfb`

## Test Philosophy

**What We Test:**
- Store logic and reactivity
- Component rendering and interactions
- IPC integration
- Business logic in TabManager
- Provider system functionality

**What We Don't Test:**
- Visual styling
- Electron main process E2E
- Third-party libraries

## Best Practices

1. Keep tests fast (< 100ms per test)
2. Mock external dependencies (IPC, localStorage)
3. Test behavior, not implementation
4. Isolate tests (independent)
5. Clear test names (describe what is being tested)

## High-Value Unit/Component Tests to Add

- **Round-trip render/remount checks for persisted views.** Seed stores for chat transcripts, notes, uploads, or settings, render the component, unmount, re-render, and assert the same content appears. Targets regressions where data disappears after navigation/remount.
- **Tab switch persistence with distinct payloads.** Initialize two tabs with different saved state, render tab A, switch to tab B, unmount, re-render tab A, and confirm its content and selection persist. Catches state leaks between tabs and selection edge cases.
- **Store hydration after reset.** Save store state, clear it (simulating an app restart), re-initialize, and verify components render the restored data. Provides fast coverage for rehydration without full E2E.
- **Error-path rendering for providers with mocked failures.** For components that surface provider errors, mock discovery/capability failures or timeouts and assert the UI surfaces the error state without crashing.
- **Concurrency/race handling at the component boundary.** Simulate out-of-order responses or double submissions via mocked promises and ensure the component renders the latest state while ignoring stale updates.
