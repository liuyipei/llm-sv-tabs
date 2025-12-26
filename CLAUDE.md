# Build Instructions for Claude Code

## Installing Dependencies

**In restricted environments (Claude Code, sandboxed CI/CD):**
```bash
npm install --ignore-scripts
```

**Why `--ignore-scripts`?**
- Skips Electron binary download which fails in restricted environments
- Still installs all packages needed for building and testing

## Build Commands

```bash
npm run build           # Full build (renderer + main)
npm run build:renderer  # Vite builds the Svelte UI
npm run build:main      # TypeScript compiles Electron main process + bundles preload scripts
npm run bundle:preload  # Bundle preload scripts to CommonJS (auto-run by build:main)
npm run typecheck       # Type checking without emitting files
```

**Note on preload scripts**: Electron preload scripts with `sandbox: true` cannot use ES6 `import` statements. The build process automatically bundles them using esbuild to CommonJS format.

## Testing

```bash
npm test                # Run all tests (~80 tests in <10 seconds)
npm run test:watch      # Watch mode
npm run test:ui         # Interactive Vitest UI
npm run test:coverage   # With coverage report
npm run test:smoke      # Smoke test: launch app headless, exit on success
```

No build required for tests!

## Running the App

```bash
npm start               # Build and run Electron
npm run electron:dev    # Run Electron directly (skip build)
npm run start:headless  # Run in headless mode (catches rendering errors)
```

### Headless Mode

The `start:headless` command runs the app in headless mode, which is useful for catching rendering errors in CI or automated testing:

- **Linux**: Uses `xvfb-run` to create a virtual framebuffer
- **macOS**: Runs with offscreen rendering enabled
- **Windows**: Runs with offscreen rendering enabled

## Distribution

```bash
npm run dist            # Build for current platform
npm run dist:mac        # macOS only
npm run dist:win        # Windows only
npm run dist:linux      # Linux only
npm run dist:all        # All platforms
```

## Project Structure

```
llm-sv-tabs/
├── src/
│   ├── main/              # Electron main process (Node.js)
│   │   ├── main.ts        # Entry point
│   │   ├── tab-manager.ts # BrowserView tab management
│   │   ├── preload.ts     # IPC bridge
│   │   ├── providers/     # LLM provider integrations
│   │   ├── services/      # Content extraction
│   │   └── templates/     # HTML templates for tab content
│   └── ui/                # Svelte 5 renderer process
│       ├── components/    # Svelte components
│       ├── stores/        # Svelte stores (reactive state)
│       └── lib/           # Utilities
├── tests/                 # Vitest unit/integration tests
├── dist-main/            # Compiled main process output
└── dist/                 # Compiled renderer output
```

## TypeScript Configuration

- **Main tsconfig**: `tsconfig.json` (renderer process, Svelte UI)
- **Main process tsconfig**: `tsconfig.main.json` (Electron main, Node.js)
- **Path aliases** in tsconfig.json:
  - `$lib/*` → `src/ui/lib/*`
  - `$components/*` → `src/ui/components/*`
  - `$stores/*` → `src/ui/stores/*`
  - `$utils/*` → `src/ui/utils/*`
  - `$config/*` → `src/ui/config/*`

## Common Mistakes to Avoid

- **DON'T** run `npm install` without `--ignore-scripts` in restricted environments
- **DON'T** try to run `npm start` in environments without Electron binary
- **DON'T** modify `dist/` or `dist-main/` directly (auto-generated)

## Documentation Guidelines

When implementing features or making architectural changes:

### Prefer Existing Design Docs
- **Check `docs/design/` first** - There are 17+ design documents covering architecture, patterns, and implementation details
- **Extend existing docs** when adding to an existing feature (e.g., add streaming details to `16-streaming-implementation-details.md`)
- **Cross-reference related docs** using relative links (e.g., `[Design System](./13-design-system.md)`)

### Creating New Design Docs
When a feature warrants its own design doc:
1. **Follow the numbering pattern**: `docs/design/NN-descriptive-name.md` (next available number)
2. **Use consistent structure**: Status badge, Overview, Related Docs, Architecture, Testing, Summary
3. **Add to README.md**: Include in the Design Documentation section with a one-line description
4. **Link from related docs**: Add cross-references to/from related design documents

### Design Doc Template
```markdown
# Feature Name

**Status:** ✅ Implemented | 🚧 In Progress | 📋 Planned
**Location:** `src/path/to/main/files`

---

## Overview
Brief description of what this feature does.

### Related Docs
- **[Related Doc](./NN-related.md)**: How it relates

---

## Architecture
Technical details, diagrams, code examples.

---

## Testing
Where tests live, what they cover.

---

## Summary
Key takeaways.
```

### What NOT to Document
- Trivial bug fixes or small refactors
- Implementation details that are clear from well-commented code
- Temporary workarounds (use code comments instead)

## Notes

- Node.js 22+ recommended (matches Electron 39 runtime), minimum 18+
- No API keys required for basic building/testing
- LLM providers: OpenAI, Anthropic, Ollama, local LLMs (code in `src/main/providers/`)
