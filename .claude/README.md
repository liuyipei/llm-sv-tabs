# ⚠️ Project Setup for Claude Code - READ THIS FIRST! ⚠️

## 🚨 CRITICAL: Electron Binary Download

**ALWAYS use `npm install --ignore-scripts` in restricted environments!**

- ✅ In Claude Code: `npm install --ignore-scripts`
- ✅ Safe for building/testing (Electron runtime not needed)
- ✅ The SessionStart hook automatically handles this
- ❌ DON'T run `npm install` without `--ignore-scripts` - it will fail!

**See `.claude/BUILD-INSTRUCTIONS.md` for quick reference.**

## Dependencies

- **Node.js 22+** recommended (matches Electron 39 runtime)
  - Minimum: Node.js 18+
- **npm** (comes with Node.js)
- Install: `npm install` (or `npm install --ignore-scripts` in restricted environments)

## Build Commands

- **Development build**: `npm run build`
  - Builds renderer: `npm run build:renderer` (Vite build)
  - Builds main process: `npm run build:main` (TypeScript compilation)
- **Type checking**: `npm run typecheck` (runs TypeScript without emitting files)
- **Development server** (Vite only): `npm run dev`
- **Run Electron**: `npm start` (builds then runs Electron)
- **Development mode**: `npm run electron:dev` (runs Electron directly)

## Testing

- **Run all tests**: `npm test` (Vitest with 80+ tests, completes in <10 seconds)
- **Watch mode**: `npm test:watch` or `npm run test:watch`
- **Test UI**: `npm run test:ui` (interactive Vitest UI)
- **Coverage**: `npm run test:coverage`

### Test Structure
Tests are located in `/tests` directory and cover:
- Store logic and reactivity
- Component rendering
- IPC bridge
- Tab management
- Provider system

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
- **Path aliases**: Configured in tsconfig.json:
  - `$lib/*` → `src/ui/lib/*`
  - `$components/*` → `src/ui/components/*`
  - `$stores/*` → `src/ui/stores/*`
  - `$utils/*` → `src/ui/utils/*`
  - `$config/*` → `src/ui/config/*`

## Important Notes

### Build Requirements
- **Always run both builds**: `npm run build` compiles both renderer (Vite) and main process (TypeScript)
- **Don't modify `dist/` or `dist-main/`**: These are auto-generated build outputs

### Development Workflow
- **For code changes**: Run `npm run build` then `npm start` to test in Electron
- **For quick UI iteration**: Use `npm run dev` (Vite HMR, but won't run Electron features)
- **For testing**: Just run `npm test` (no build needed for tests)

### LLM Provider Integration
- Project integrates with OpenAI, Anthropic, Ollama, and local LLM providers
- Provider code is in `src/main/providers/`
- No API keys required for basic building/testing

## Hooks

### SessionStart.sh
Automatically runs when a Claude Code session starts:
- Checks if `node_modules` exists
- Runs `npm install --ignore-scripts` if dependencies are missing
- Ensures Claude Code can build and test without manual setup
