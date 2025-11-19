# LLM Browser

An LLM-powered browser built with Electron and Svelte, following modern reactive patterns.

## Features

- **Tab Management**: Create, switch, and close browser tabs with BrowserView
- **Svelte Components**: Modern reactive UI built with Svelte 5
- **Reactive State**: Svelte stores for automatic UI updates
- **IPC Bridge**: Clean separation between Electron and Svelte layers
- **Bookmarks**: Save and organize frequently visited sites
- **LLM Integration**: Query and interact with tab content using LLM

## Architecture

This project follows the migration pattern from [llm-dom-browser](https://github.com/liuyipei/llm-dom-browser), implementing:

- **Component-based UI**: Modular Svelte components instead of manual DOM manipulation
- **Reactive State Management**: Svelte stores replace global state objects
- **Automatic Reactivity**: No manual re-render calls needed
- **Scoped Styles**: Component-scoped CSS prevents style leaks

### Project Structure

```
llm-sv-tabs/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Entry point
│   │   ├── tab-manager.js # Tab management logic
│   │   └── preload.js     # IPC preload script
│   └── ui/                # Svelte UI layer
│       ├── App.svelte     # Root component
│       ├── main.js        # Svelte entry
│       ├── components/    # UI components
│       │   ├── tabs/      # Tab-related components
│       │   ├── bookmarks/ # Bookmark components
│       │   └── chat/      # Chat interface
│       ├── stores/        # Svelte stores
│       │   ├── tabs.js    # Tab state
│       │   ├── config.js  # Configuration
│       │   └── ui.js      # UI state
│       └── lib/           # Utilities
│           └── ipc-bridge.js  # Electron-Svelte bridge
├── vite.config.js
├── svelte.config.js
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Run Vite dev server (for UI development)
npm run dev

# Run Electron app
npm run electron:dev

# Build for production
npm run build
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

Comprehensive test suite with **Vitest** and **Svelte Testing Library**:

- **6 test files** covering stores, components, and IPC bridge
- **~160 total tests** with focus on fast execution
- **< 10 second** test runs optimized for CI/CD
- **GitHub Actions** integration for automated testing on PRs

See [TESTING.md](./TESTING.md) for detailed testing guide.

### Quick Test Run
```bash
npm test
```

Test coverage includes:
- ✅ Store logic and reactivity
- ✅ Component rendering and interactions
- ✅ IPC bridge (mock and Electron modes)
- ✅ User interactions (clicks, inputs)
- ✅ State management (tabs, config, UI)

## Migration Benefits

Compared to vanilla JavaScript approach:

- **60-70% code reduction** in UI layer
- **Zero manual DOM manipulation**
- **Automatic reactivity** - no manual render calls
- **Better developer experience** with hot reload
- **Scoped component styles**
- **Easier testing** with component isolation

## Key Patterns

### Svelte Stores
Global state is managed through reactive Svelte stores:
- `activeTabs` - Map of open tabs
- `selectedTabs` - Set of selected tab IDs
- `activeTabId` - Currently active tab
- `sortMode` - Tab sorting mode

### IPC Bridge
The `ipc-bridge.js` cleanly separates Electron and Svelte concerns:
- Listens to Electron events and updates stores
- Exposes clean API for components via Svelte context
- Supports mock mode for browser-based development

### Component Communication
- **Parent → Child**: Props
- **Child → Parent**: Events
- **Global State**: Stores

## License

MIT
