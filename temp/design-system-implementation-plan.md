# Design System Implementation Plan

**Status:** High-level planning (awaiting codebase refactor completion)
**Reference:** [Design System](./13-design-system.md)
**Last Updated:** 2025-12-23

---

## Current State Summary

The codebase uses a **consistent dark theme visually** but with **scattered implementation**:

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| Token definition | None (no `tokens.css`) | Centralized `:root` variables |
| Color application | 40+ hardcoded hex values | CSS custom properties |
| Styling approach | Svelte scoped `<style>` blocks | Scoped styles + shared tokens |
| Global styles | Inline in `App.svelte` | Dedicated global stylesheet |
| LLM components | CSS vars with **wrong defaults** | Fixed vars referencing tokens |

### Key Inconsistencies Found

1. **LLM config components** (`ProviderSelector`, `ApiKeyInput`, `EndpointConfig`, `ModelSelector`) use CSS variables with **light-theme fallbacks** (e.g., `var(--input-bg, white)`) that don't match the dark theme
2. **Spacing is irregular**: values like `3px`, `15px` exist outside the design scale (2, 4, 8, 12, 16, 20, 24)
3. **Border/hover color overlap**: `#3e3e42` is used for both borders AND hover states, creating ambiguity
4. **Font size units mixed**: some components use `px`, others `rem`/`em`

---

## Implementation Phases (High-Level)

### Phase 1: Foundation — Create Token System

**Goal:** Establish a single source of truth for design tokens.

**Tasks:**
- Create `src/ui/styles/tokens.css` with `:root` variable definitions
- Import tokens.css in `src/ui/index.html` or main entry point
- Use the proposed variables from design-system.md section "Proposed CSS Variable Definitions"

**Hints for implementation:**
- Start with colors (most impactful, easiest to audit)
- Include spacing scale, typography, shadows, z-index
- Consider whether to keep both `--bg-surface-1` semantics OR simpler `--bg-secondary` naming — recommend simpler names per design-system.md

**Files to touch:**
- Create: `src/ui/styles/tokens.css`
- Modify: `src/ui/index.html` (add import)

---

### Phase 2: Fix Broken CSS Variables

**Goal:** LLM config components should work correctly with the token system.

**Current problem:** These files use CSS variables with light-theme defaults:
- `src/ui/components/llm/ProviderSelector.svelte`
- `src/ui/components/llm/ApiKeyInput.svelte`
- `src/ui/components/llm/EndpointConfig.svelte`
- `src/ui/components/llm/ModelSelector.svelte`
- `src/ui/components/llm/LLMControls.svelte`

**Example fix needed:**
```css
/* Before (broken): */
background: var(--input-bg, white);
color: var(--text-primary, #333);

/* After (correct): */
background: var(--bg-input);  /* Now defined in tokens.css */
color: var(--text-primary);
```

**Hints for implementation:**
- Map current variable names to token names (may need renaming)
- Remove fallback values entirely once tokens.css is in place
- Verify visual appearance matches rest of app

---

### Phase 3: Migrate High-Impact Components

**Goal:** Convert the most-used components to use tokens instead of hardcoded values.

**Priority order (by usage/impact):**
1. `App.svelte` — global body styles, sidebar structure
2. `TabItem.svelte` — 30+ color instances, complex states
3. `ChatMessage.svelte` — markdown styles, semantic colors
4. `UrlBar.svelte` — visible on every view
5. `InputControls.svelte` — user interaction point
6. `Toast.svelte` — feedback system
7. `Modal.svelte` — overlay patterns

**Hints for implementation:**
- Work one component at a time
- Search-replace common patterns: `#1e1e1e` → `var(--bg-primary)`, etc.
- Keep scoped styles; just replace values with variables
- Don't refactor component structure during this phase

---

### Phase 4: Normalize Spacing

**Goal:** Replace irregular spacing values with the design scale.

**Current irregular values to find/fix:**
- `3px` → `2px` or `4px`
- `15px` → `16px`
- `5px` → `4px` or `6px`
- `10px` → `8px` or `12px`

**Hints for implementation:**
- Use grep to find `padding:` and `margin:` declarations
- Be careful with `6px` — it's a valid scale value (`space-3`)
- Tab items use `3px` margin-bottom — consider if `4px` changes feel

---

### Phase 5: Create Shared Component Patterns

**Goal:** Establish reusable base styles for common patterns.

**Patterns to extract (based on design-system.md):**
- `.btn-primary`, `.btn-secondary`, `.btn-icon`, `.btn-danger`
- `.input-text`, `.input-editable`
- `.card`, `.card-section`
- `.menu-item`, `.menu-divider`

**Hints for implementation:**
- Could go in `tokens.css` or separate `patterns.css`
- Components can `@apply` these or extend via composition
- Don't over-abstract — prefer explicit over clever

---

### Phase 6: Typography Audit

**Goal:** Ensure consistent font usage across the app.

**Issues to check:**
- Font family consistency (system vs mono)
- Font size scale adherence
- Font weight usage (400, 500, 600 only per design)
- Line height normalization

**Files with heavy typography:**
- `MessageStream.css` — markdown rendering
- `ChatMessage.svelte` — message display
- `TabItem.svelte` — compact display

---

### Phase 7: Accessibility Review

**Goal:** Ensure design tokens support accessibility.

**Tasks:**
- Verify color contrast ratios meet WCAG AA
- Confirm focus states are visible (`#007acc` on dark backgrounds)
- Add `prefers-reduced-motion` support for transitions

---

## Component Inventory

Components organized by styling complexity:

### Heavy Styling (40+ CSS lines)
| Component | Lines | Key Issues |
|-----------|-------|------------|
| `MessageStream.css` | 391 | External file, well-structured |
| `TabItem.svelte` | 163 | Most hardcoded colors |
| `ChatMessage.svelte` | 175 | Markdown + semantic colors |
| `App.svelte` | 114 | Global styles mixed in |

### Medium Styling (20-40 CSS lines)
- `UrlBar.svelte` — navigation controls
- `InputControls.svelte` — chat input area
- `BookmarksSection.svelte` — list styling
- `NotesSection.svelte` — includes gradients (special case)

### Light Styling (<20 CSS lines)
- `Modal.svelte` — minimal, uses rgba
- `Toast.svelte` — dynamic via JS
- `ResizableDivider.svelte` — focused purpose
- Most LLM config components — broken CSS vars

---

## Color Token Mapping Reference

Quick reference for common hardcoded → token replacement:

| Hardcoded Value | Token Name | Usage |
|-----------------|------------|-------|
| `#1e1e1e` | `--bg-primary` | Main background |
| `#252526` | `--bg-secondary` | Sidebar, raised surfaces |
| `#2d2d30` | `--bg-tertiary` | Tables, tab items |
| `#3c3c3c` | `--bg-input` | Input fields |
| `#3e3e42` | `--bg-hover` / `--border-color` | Hover states, borders |
| `#007acc` | `--accent-color` | Interactive elements |
| `#005a9e` | `--accent-hover` | Button hover |
| `#094771` | `--bg-active` | Active tab |
| `#d4d4d4` | `--text-primary` | Body text |
| `#ffffff` | `--text-bright` | Headings |
| `#8c8c8c` | `--text-secondary` | Muted text |
| `#808080` | `--text-tertiary` | URLs, hints |
| `#606060` | `--text-disabled` | Disabled states |
| `#e81123` | `--danger-red` | Close buttons, destructive |
| `#f48771` | `--error-text` | Error messages |

---

## Special Considerations

### NotesSection Gradients
```css
/* Keep these as custom values — not part of base palette */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```
Consider whether gradients should become tokens or remain component-specific.

### MessageStream.css
This external file is the most structured styling in the codebase. It could serve as a **template** for how to organize token usage. After migration, it might move to a `/styles/` directory.

### External Dependencies
- `highlight.js/styles/github-dark.css` — syntax highlighting
- `katex/dist/katex.css` — math rendering

These import their own color schemes. May need custom overrides to align perfectly.

---

## Testing Strategy

After each phase:
1. Visual inspection of all sidebar panels (Chat, Settings, Bookmarks, Notes)
2. Tab interactions (hover, active, selected states)
3. Modal and toast appearance
4. URL bar and navigation buttons
5. LLM response rendering (MessageStream)

---

## Notes for Resuming Work

When the LOC refactor is complete:
1. Check if component file structure has changed
2. Re-run color grep to find any new hardcoded values
3. Start with Phase 1 (tokens.css) — it's non-breaking
4. Phase 2 (LLM components) is highest priority for functional fix
5. Phases 3-7 can be done incrementally per component

---

## Decisions (Resolved)

1. **Naming convention**: Use `--bg-secondary` (simpler) or `--bg-surface-1` (semantic)?
   - **Decision:** Simpler names per design-system.md

2. **Spacing units**: Keep `px` or migrate to `rem` for accessibility?
   - **Decision:** Move directly to `rem` for scalability

3. **MessageStream.css location**: Keep in component folder or move to `/styles/`?
   - **Decision:** Move CSS to `/styles/`

4. **Gradient tokens**: Should NotesSection gradients become tokens?
   - **Decision:** No. Tab rendering styles (for LLM conversations, files, notes, etc.) are separate concerns from LLM conversation content. Visual presentation should not impact LLM interactions.
