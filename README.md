# LLM Browser

LLM-powered browser built with Electron and Svelte 5, featuring tab management and content extraction for AI queries.

## What Makes This Browser Different

This project isn't intended to be a general-purpose browser with an AI feature added on.
Its focus is to streamline workflows where browsing, gathering information, and querying LLMs all happen together.

### Tabs as Context Units

Each tab can be selected as part of a query. This works for webpages, PDFs, file previews, notes, and LLM responses. Instead of copying content manually, you can:

- Browse normally and accumulate information across multiple tabs
- Mark which tabs should contribute context
- Send a question that automatically incorporates those sources
- Treat LLM responses as new tabs that can be reused in future steps

This allows you to build a working set of pages, documents, data sources, and model outputs that evolve with your task.

### Notes, Files, Screenshots, and Piecemeal Conversations

Along with web pages, the browser supports:

- Uploaded files (for vision or document models)
- Screenshot capture with region selection (desktop or any application)
- Free-form notes that sit alongside tabs
- LLM response tabs stored individually rather than as a single long chat thread

Conversations become modular rather than linear, giving you finer control over how follow-up prompts are shaped and what context is included.

### Multi-Source Analysis

A common workflow is opening several data sources in different tabs. These might include articles, PDFs, LLM summaries, or your own notes. You can inspect each source, select the relevant ones, and ask the model to cross-check or reconcile them. This all happens without switching tools.

### Design Documentation

For a deep dive into the architecture and design philosophy:

- **[User Experience & Prompt Context Management](./design/04-user-experience-and-context-management.md)** ⭐ **Start here** - Learn about the UX design
- [Token Streaming & API Providers](./design/01-token-streaming-and-providers.md) - Provider architecture and real-time streaming
- [Visual Layout Architecture](./design/02-visual-layout.md) - Hybrid rendering system combining Electron and Svelte
- [Flexible Tab System](./design/03-flexible-tab-system.md) - How tabs handle URLs, files, text, and LLM responses

## Features

- **Tab Management**: Create, switch, close tabs with BrowserView for web content, notes, files, and LLM responses
- **LLM Integration**: Query tabs with Fireworks AI, OpenRouter, Anthropic, OpenAI, and more
- **Screenshot Capture**: Native region-based screenshots with drag-to-select overlay (Ctrl+Alt+S / Cmd+Alt+S)
- **Content Extraction**: DOM serialization and webpage screenshots for vision models
- **File Upload**: Support for images, PDFs, and text files as tab content
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
│   │   ├── main.ts        # Entry point, global shortcuts
│   │   ├── tab-manager.ts # Tab management
│   │   ├── preload.ts     # IPC preload
│   │   ├── providers/     # LLM providers
│   │   ├── services/      # Screenshot, content extraction
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
