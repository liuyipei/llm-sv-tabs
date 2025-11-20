# Migration Status: llm-dom-browser → llm-sv-tabs

This document tracks the migration from the original `llm-dom-browser` implementation to the new Svelte-based `llm-sv-tabs` architecture.

## Overview

**Source Repository**: [llm-dom-browser](https://github.com/liuyipei/llm-dom-browser)
**Target Repository**: llm-sv-tabs (this repo)
**Status**: Early stage - foundational architecture complete, core features not yet implemented

## Current State

### ✅ What's Implemented

1. **Architecture Foundation**
   - Electron + Svelte 5 setup
   - Vite build system
   - Component structure (tabs, chat, bookmarks)
   - Store architecture (tabs, config, ui)
   - IPC bridge setup
   - Basic tab manager with BrowserView support

2. **UI Components (Shell Only)**
   - `App.svelte` - main application layout
   - `TabsSection.svelte` - tab list container
   - `TabList.svelte` - tab rendering (empty state handling)
   - `TabItem.svelte` - individual tab component
   - `TabControls.svelte` - sort controls UI
   - `BookmarksSection.svelte` - bookmarks container
   - `ChatContainer.svelte` - chat message display
   - `InputControls.svelte` - URL and query input

3. **Stores**
   - Tab state management (activeTabs, selectedTabs, sorting)
   - Config stores (provider, model, apiKeys)
   - UI state (menuCollapsed, queryInput, etc.)

4. **Test Suite**
   - Vitest configuration
   - Component tests for TabItem, TabList
   - Store tests for tabs, config, ui

### ❌ Critical Missing Features

The current implementation lacks the entire feature layer that makes llm-dom-browser functional:

#### 1. Tab Management (Partial)
- ❌ No tabs created on startup (UI shows empty state)
- ❌ No tab checkboxes for LLM context selection
- ❌ No drag-and-drop reordering
- ❌ No recently closed tabs
- ❌ No notes tabs functionality
- ❌ Tab persistence/restoration
- ✅ Basic BrowserView creation in TabManager (but not wired up)

#### 2. LLM Integration (Not Started)
- ❌ **No LLM providers** (needs all 10+):
  - OpenAI
  - Anthropic (Claude)
  - Google Gemini
  - xAI (Grok)
  - OpenRouter
  - Fireworks AI
  - Ollama (local)
  - LMStudio (local)
  - vLLM (local)
  - Minimax
  - Local OpenAI-compatible providers
- ❌ Provider factory pattern
- ❌ Model discovery system
- ❌ API key management and persistence
- ❌ Query orchestrator
- ❌ Context extraction from selected tabs
- ⚠️ Only placeholder echo response implemented

#### 3. UI Controls (Not Implemented)
- ❌ Provider selection dropdown
- ❌ Model selection with search/filtering
- ❌ API key input fields
- ❌ Endpoint configuration for local providers
- ❌ Health check for local endpoints
- ❌ Include media/screenshot checkbox
- ❌ Temperature/max tokens controls
- ❌ Ollama model management panel
- ❌ System prompt configuration

#### 4. Content Extraction (Not Started)
- ❌ DOM serialization preload scripts
- ❌ PDF text extraction service
- ❌ Screenshot/media capture for vision models
- ❌ File upload handling (PDF, documents)
- ❌ Content type detection

#### 5. Bookmarks (Placeholder Only)
- ❌ Bookmark creation/deletion
- ❌ Bookmark persistence
- ❌ Bookmark search
- ❌ Bookmark organization
- ⚠️ IPC handlers return empty arrays

#### 6. Advanced Features (Not Started)
- ❌ Session management
- ❌ Window management
- ❌ Keyboard shortcuts
- ❌ Application menu
- ❌ Conversation history
- ❌ Message rendering (markdown, code highlighting, math)
- ❌ Copy message functionality
- ❌ Raw text toggle for messages

## Architecture Differences

### llm-dom-browser Architecture
```
Main Process (Node.js)
├── BaseWindow (Electron container)
├── WindowManager (view management)
├── TabManager (WebContentsView management)
├── SessionManager (state persistence)
├── LLM Orchestrator (coordinates queries)
├── PDF Service (text extraction)
├── Screenshot Service (vision model support)
└── Provider System
    ├── ProviderFactory
    ├── BaseProvider (abstract)
    └── 10+ concrete providers

Renderer Process
├── chat.html (vanilla JS)
├── ui-config.js (provider configuration)
├── ui-init.js (initialization)
├── storage.js (localStorage wrapper)
└── Preload scripts (contextBridge APIs)
```

### llm-sv-tabs Architecture (Target)
```
Main Process (Node.js)
├── BrowserWindow (Electron container)
├── TabManager (BrowserView management) ✅
├── [TODO] LLM Orchestrator
├── [TODO] PDF Service
├── [TODO] Screenshot Service
└── [TODO] Provider System

Renderer Process (Svelte 5)
├── App.svelte ✅
├── Components (tabs, chat, bookmarks) ✅
├── Stores (tabs, config, ui) ✅
├── IPC Bridge ✅
└── [TODO] Message rendering utilities
```

## Migration Strategy

### Phase 1: TypeScript Conversion (Current)
- Convert all JavaScript to TypeScript
- Define core interfaces and types
- Set up proper type checking for IPC

### Phase 2: Core Tab Functionality
- Wire up tab creation on URL input
- Implement tab selection checkboxes
- Add tab context menu
- Implement tab closing/switching

### Phase 3: LLM Provider System
- Port provider base classes
- Implement provider factory
- Add model discovery
- Create provider UI controls (dropdowns, inputs)
- Implement API key management

### Phase 4: Content Extraction
- Port DOM serialization preload
- Implement PDF service
- Add screenshot service
- Wire up content extraction to LLM queries

### Phase 5: Message Rendering
- Add markdown rendering
- Implement code syntax highlighting
- Add math rendering (KaTeX)
- Implement copy/raw text toggle

### Phase 6: Advanced Features
- Bookmarks implementation
- Session persistence
- Keyboard shortcuts
- Recently closed tabs
- Notes tabs

## Key Design Decisions

### Modern Stack Choices
- **Svelte 5** (Runes) vs vanilla JS - Better state management, reactivity
- **TypeScript** - Type safety for complex provider system
- **Vitest** vs Jest - Faster, better ESM support
- **Vite** - Modern build system with HMR

### Architectural Improvements
- Component-based UI (easier to maintain than monolithic HTML)
- Store-based state management (cleaner than global variables)
- Type-safe IPC communication
- Modular test suite

### Maintaining from llm-dom-browser
- Security architecture (context isolation, sandboxing)
- Multi-provider support
- Provider factory pattern
- Content extraction approach

## Current Blockers

1. **No visible UI on startup** - Need to wire up initial tab creation
2. **No LLM controls** - Provider/model selection UI missing
3. **Placeholder LLM responses** - Real provider integration needed
4. **No content extraction** - Can't send tab content to LLM

## Next Steps

1. ✅ Convert to TypeScript
2. Create type definitions for:
   - Tab structure
   - Provider interfaces
   - LLM request/response
   - IPC message contracts
3. Implement basic tab creation workflow
4. Port provider system from llm-dom-browser
5. Add provider selection UI
6. Implement content extraction

## Resources

- **llm-dom-browser docs**: `/home/user/llm-dom-browser/README.md`
- **Provider implementation**: `/home/user/llm-dom-browser/src/providers/`
- **Original UI**: `/home/user/llm-dom-browser/src/ui/chat.html`
- **Services**: `/home/user/llm-dom-browser/src/services/`

## Version Info

- **llm-dom-browser**: Latest commit (production-ready)
- **llm-sv-tabs**: v1.0.0 (early development)
- **Electron**: 33.0.0
- **Svelte**: 5.0.0
- **Node.js**: 22.20.0+
