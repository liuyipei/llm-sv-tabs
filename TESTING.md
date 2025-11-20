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
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:ui         # With UI
npm run test:coverage   # With coverage
```

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
