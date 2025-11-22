# LLM Browser

LLM-powered browser built with Electron and Svelte 5, featuring tab management and content extraction for AI queries.

## Features

- **Tab Management**: Create, switch, close tabs with BrowserView
- **LLM Integration**: Query tabs with OpenAI, Anthropic, Ollama, local providers
- **Content Extraction**: DOM serialization and screenshots for vision models
- **Reactive UI**: Svelte 5 components with automatic updates
- **Type-Safe**: Full TypeScript with comprehensive type definitions

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm run electron:dev

# Build for production
npm run build
npm start

# Run tests
npm test
```

## Project Structure

```
llm-sv-tabs/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Entry point
│   │   ├── tab-manager.ts # Tab management
│   │   ├── preload.ts     # IPC preload
│   │   ├── providers/     # LLM providers
│   │   ├── services/      # Content extraction
│   │   └── templates/     # HTML templates
│   └── ui/                # Svelte UI
│       ├── components/    # UI components
│       ├── stores/        # Svelte stores
│       └── lib/           # Utilities
└── tests/                 # Fast unit/integration tests
```

## Testing

Comprehensive test suite with **80+ tests** running in < 10 seconds:

- Store logic and reactivity
- Component rendering
- IPC bridge
- Tab management
- Provider system

See [TESTING.md](./TESTING.md) for details.

## Architecture Benefits

- **60-70% code reduction** vs vanilla JS
- **Zero manual DOM manipulation**
- **Automatic reactivity**
- **Scoped component styles**
- **Type safety** throughout

## License

MIT
