# Testing Guide

## Overview

This project uses **Vitest** for fast, modern testing with **Svelte Testing Library** for component tests. Tests are optimized to run quickly in CI/CD pipelines (target: < 10 seconds).

## Test Structure

```
tests/
├── setup.js              # Test environment setup
├── stores/               # Store unit tests
│   ├── tabs.test.js      # Tab state management
│   ├── config.test.js    # Persisted configuration
│   └── ui.test.js        # UI state
├── components/           # Component tests
│   ├── TabItem.test.js   # Individual tab component
│   └── TabList.test.js   # Tab list rendering
└── lib/                  # Library tests
    └── ipc-bridge.test.js # Electron-Svelte IPC bridge
```

## Test Coverage

### Store Tests (3 files, ~120 tests)
- **tabs.test.js**: Tab CRUD operations, sorting, selection, reactivity
- **config.test.js**: LocalStorage persistence, API configuration
- **ui.test.js**: UI state, chat messages, modal management

### Component Tests (2 files, ~20 tests)
- **TabItem.test.js**: Rendering, interactions, active/selected states
- **TabList.test.js**: List rendering, empty states

### Library Tests (1 file, ~20 tests)
- **ipc-bridge.test.js**: Mock API, Electron API integration, event handlers

## Running Tests

```bash
# Run all tests once (for CI)
npm test

# Watch mode (for development)
npm run test:watch

# With UI
npm run test:ui

# With coverage
npm run test:coverage
```

## Performance Optimizations

### Fast Test Execution
- **Single fork mode**: Tests run in one process for speed
- **Happy DOM**: Lightweight DOM implementation (faster than jsdom)
- **Isolated tests**: Each test is independent but runs quickly
- **No Electron**: Tests run in Node.js environment with mocks

### CI/CD Integration
- **GitHub Actions**: Runs on every PR and push
- **Timeout**: 5 minutes max (tests complete in < 10 seconds)
- **Caching**: npm dependencies cached for faster installs
- **Parallel jobs**: Tests and linting run in parallel

## Test Philosophy

### What We Test
✅ **Store logic**: State mutations, derived stores, reactivity
✅ **Component rendering**: Props, conditional rendering, lists
✅ **User interactions**: Clicks, form inputs, keyboard events
✅ **IPC integration**: Mock mode and Electron API integration

### What We Don't Test
❌ **Visual styling**: Use visual regression testing tools separately
❌ **Electron main process**: Requires separate E2E test suite
❌ **Third-party libraries**: Trust their test coverage

## Writing Tests

### Store Tests
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { myStore } from '$stores/myStore.js';

describe('myStore', () => {
  beforeEach(() => {
    myStore.set(initialValue);
  });

  it('should update value', () => {
    myStore.set('new value');
    expect(get(myStore)).toBe('new value');
  });
});
```

### Component Tests
```javascript
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MyComponent from '$components/MyComponent.svelte';

describe('MyComponent', () => {
  it('should render with props', () => {
    const { getByText } = render(MyComponent, {
      props: { title: 'Test' }
    });

    expect(getByText('Test')).toBeTruthy();
  });

  it('should handle clicks', async () => {
    const { getByRole } = render(MyComponent);
    const button = getByRole('button');

    await fireEvent.click(button);
    // Assert expected behavior
  });
});
```

### Testing with Context
```javascript
const mockIpc = {
  openUrl: vi.fn(),
  closeTab: vi.fn(),
};

render(MyComponent, {
  context: new Map([['ipc', mockIpc]])
});
```

## Continuous Integration

### GitHub Actions Workflow
- **Trigger**: Every PR and push to main/claude/* branches
- **Jobs**:
  - **test**: Run all tests with coverage
  - **lint**: Verify project structure
- **Fast feedback**: Results in < 2 minutes

### Coverage Reporting
- Reports uploaded to Codecov (optional)
- Coverage thresholds can be configured in `vitest.config.js`

## Best Practices

1. **Keep tests fast**: Aim for < 100ms per test
2. **Use mocks wisely**: Mock external dependencies (IPC, localStorage)
3. **Test behavior, not implementation**: Focus on user-facing behavior
4. **Isolate tests**: Each test should be independent
5. **Clear test names**: Describe what is being tested
6. **Arrange-Act-Assert**: Structure tests clearly

## Debugging Tests

```bash
# Run specific test file
npx vitest run tests/stores/tabs.test.js

# Run tests matching pattern
npx vitest run -t "should add a tab"

# Debug mode
npx vitest --inspect-brk

# UI mode for visual debugging
npm run test:ui
```

## Future Improvements

- [ ] E2E tests with Playwright/Spectron for Electron
- [ ] Visual regression testing
- [ ] Performance benchmarks
- [ ] Mutation testing
- [ ] Accessibility testing
