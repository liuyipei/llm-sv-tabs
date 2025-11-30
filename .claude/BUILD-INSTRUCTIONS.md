# ⚠️ CRITICAL BUILD INSTRUCTIONS ⚠️

## BEFORE YOU RUN ANY BUILD COMMANDS, READ THIS!

### Installing Dependencies

**In restricted environments (Claude Code, sandboxed CI/CD):**
```bash
npm install --ignore-scripts
```

**Why `--ignore-scripts`?**
- Skips Electron binary download which fails in restricted environments
- Still installs all packages needed for building and testing
- The SessionStart hook automatically runs this when session starts

### Building the Project

```bash
npm run build
```

This runs:
1. `npm run build:renderer` - Vite builds the Svelte UI
2. `npm run build:main` - TypeScript compiles the Electron main process

### Testing

```bash
npm test
```

No build required! Tests run in <10 seconds.

---

## Common Mistakes to Avoid

❌ **DON'T RUN:** `npm install` (without --ignore-scripts)
✅ **DO RUN:** `npm install --ignore-scripts`

❌ **DON'T:** Try to run `npm start` (needs Electron binary)
✅ **DO:** Run `npm run build` and `npm test`

---

## More Information

See `.claude/README.md` for complete project documentation.
