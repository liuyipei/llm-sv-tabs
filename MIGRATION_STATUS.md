# Migration Status: llm-dom-browser → llm-sv-tabs

This document tracks the migration from the original `llm-dom-browser` implementation to the new Svelte-based `llm-sv-tabs` architecture.

## Overview

**Source Repository**: [llm-dom-browser](https://github.com/liuyipei/llm-dom-browser)
**Target Repository**: llm-sv-tabs (this repo)
**Status**: Phase 2 Complete - Core tab functionality fully implemented, ready for Phase 3 (LLM providers)

## Quick Summary

**What Works:**
- ✅ Complete TypeScript infrastructure with comprehensive type definitions
- ✅ Svelte 5 UI components (fully functional)
- ✅ Persisted config stores (provider, model, apiKeys, etc.)
- ✅ Type-safe IPC bridge
- ✅ Latest dependency versions (Electron 39, Svelte 5.43, Vite 7, Vitest 4)
- ✅ **Tab creation and management (NEW)**
- ✅ **Tab selection for LLM context (NEW)**
- ✅ **Tab switching and closing (NEW)**
- ✅ **Context menu with reload/copy URL (NEW)**
- ✅ 71+ passing tests (with new Phase 2 integration tests)

**What's Missing:**
- ❌ LLM provider implementations (all 11 providers need porting)
- ❌ LLM control UI (provider/model selection, API keys)
- ❌ Content extraction (DOM, PDF, screenshots)
- ❌ Real LLM responses (currently echo placeholder)

**Next Priority:** Port LLM provider system (Phase 3) to enable real AI interactions

## Current State

### ✅ What's Implemented

1. **TypeScript Infrastructure (COMPLETE)**
   - ✅ Full TypeScript conversion of codebase
   - ✅ Comprehensive type definitions (`src/types.ts`):
     - Tab types (Tab, TabData, TabType, SortMode)
     - LLM provider types (all 11 providers: openai, anthropic, gemini, xai, openrouter, fireworks, ollama, lmstudio, vllm, minimax, local-openai-compatible)
     - Chat/Message types (ChatMessage, MessageRole, MessageStats)
     - Content extraction types (SerializedDOM, PDFContent, ExtractedContent)
     - Query options and LLM response types
     - IPC message contracts
   - ✅ Type-safe IPC bridge interface

2. **Architecture Foundation**
   - ✅ Electron + Svelte 5 setup
   - ✅ Vite build system
   - ✅ Component structure (tabs, chat, bookmarks)
   - ✅ Store architecture (tabs, config, ui)
   - ✅ IPC bridge setup with TypeScript types
   - ✅ Basic tab manager with BrowserView support

3. **UI Components (Shell Only)**
   - `App.svelte` - main application layout
   - `TabsSection.svelte` - tab list container
   - `TabList.svelte` - tab rendering (empty state handling)
   - `TabItem.svelte` - individual tab component
   - `TabControls.svelte` - sort controls UI
   - `BookmarksSection.svelte` - bookmarks container
   - `BookmarkList.svelte` - bookmark list rendering
   - `ChatContainer.svelte` - chat message display
   - `ChatMessage.svelte` - individual message component
   - `InputControls.svelte` - URL and query input

4. **Stores (with localStorage persistence)**
   - ✅ Tab state management (activeTabs, selectedTabs, sorting)
   - ✅ Config stores (provider, model, apiKeys, maxTokens, temperature, systemPrompt, endpoint)
   - ✅ UI state (menuCollapsed, queryInput, urlInput, isLoading, messages)
   - ✅ Persisted store system for config values

5. **Test Suite**
   - Vitest configuration (v4.0.8)
   - Component tests for TabItem, TabList
   - Store tests for tabs, config, ui
   - 71 tests passing

### ❌ Critical Missing Features

The current implementation lacks some advanced features from llm-dom-browser:

#### 1. Tab Management (✅ Core Complete)
- ✅ **Tab creation via URL input (Phase 2)**
- ✅ **Tab checkboxes for LLM context selection (Phase 2)**
- ✅ **Tab switching and activation (Phase 2)**
- ✅ **Tab closing (Phase 2)**
- ✅ **Context menu: reload, copy URL, close (Phase 2)**
- ✅ **BrowserView integration (Phase 2)**
- ❌ Drag-and-drop reordering (Future enhancement)
- ❌ Recently closed tabs (Future enhancement)
- ❌ Notes tabs functionality (Future enhancement)
- ❌ Tab persistence/restoration (Future enhancement)

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

### Phase 1: TypeScript Conversion ✅ **COMPLETE**
- ✅ Convert all JavaScript to TypeScript
- ✅ Define core interfaces and types
- ✅ Set up proper type checking for IPC
- ✅ Create comprehensive type definitions for all systems
- ✅ Implement persisted config stores

### Phase 2: Core Tab Functionality ✅ **COMPLETE**
- ✅ Wire up tab creation on URL input
- ✅ Implement tab selection checkboxes for LLM context
- ✅ Add tab context menu (reload, copy URL, close)
- ✅ Implement tab closing/switching
- ✅ Add reload tab functionality
- ✅ Add fast integration tests for tab workflow

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

1. ✅ ~~**No visible UI on startup**~~ - Fixed! Tabs now appear and work
2. **No LLM controls** - Provider/model selection UI missing
3. **Placeholder LLM responses** - Real provider integration needed
4. **No content extraction** - Can't send tab content to LLM

## Next Steps (Priority Order)

### Immediate (Phase 2 - Core Tab Functionality) ✅ **COMPLETE**
1. ✅ ~~Convert to TypeScript~~
2. ✅ ~~Create comprehensive type definitions~~
3. ✅ ~~Wire up tab creation workflow~~
   - ✅ Connect URL input to tab manager
   - ✅ Display created tabs in UI
   - ✅ Implement tab switching
4. ✅ ~~Add tab selection checkboxes for LLM context~~
5. ✅ ~~Implement tab context menu (close, reload, copy URL)~~
6. ✅ ~~Add reload tab functionality~~
7. ✅ ~~Create fast integration tests for Phase 2 features~~

### Short-term (Phase 3 - LLM Integration)
6. **Create LLM provider UI components**
   - Provider selection dropdown
   - Model selection with search
   - API key input fields
   - Endpoint configuration for local providers
7. **Port provider system** from llm-dom-browser
8. **Implement model discovery** system

### Medium-term (Phase 4-5)
9. **Content extraction services** (DOM, PDF, screenshots)
10. **Message rendering** (markdown, code highlighting, math)

## Resources

- **llm-dom-browser docs**: `/home/user/llm-dom-browser/README.md`
- **Provider implementation**: `/home/user/llm-dom-browser/src/providers/`
- **Original UI**: `/home/user/llm-dom-browser/src/ui/chat.html`
- **Services**: `/home/user/llm-dom-browser/src/services/`

## Version Info

- **llm-dom-browser**: Latest commit (production-ready)
- **llm-sv-tabs**: v1.0.0 (Phase 1 complete, Phase 2 in progress)
- **Electron**: 39.2.2 (upgraded from 33.0.0)
- **Svelte**: 5.43.8 (upgraded from 5.0.0)
- **Vite**: 7.2.2 (upgraded from 5.4.0)
- **Vitest**: 4.0.8 (upgraded from 2.0.0)
- **TypeScript**: 5.9.3
- **Node.js**: 22.20.0+

### Recent Updates
- **2025-11-20**: Completed Phase 2 - Core Tab Functionality
  - Fully wired tab creation via URL input
  - Implemented tab selection checkboxes for LLM context
  - Added context menu (reload, copy URL, close)
  - Implemented tab switching and closing workflow
  - Added reload tab functionality to TabManager
  - Created fast integration tests for tab workflow
  - Added context menu tests
- **2025-11-20**: Upgraded all core dependencies to latest versions
- **2025-11-19**: Completed TypeScript conversion (Phase 1)
  - Added comprehensive type definitions (`src/types.ts`)
  - Implemented persisted config stores
  - Created type-safe IPC bridge
