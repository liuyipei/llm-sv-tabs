# Message Rendering Modes

**Status:** ✅ Implemented
**Location:** `src/ui/rendering/index.ts`

---

## Overview

Assistant messages can be viewed in two modes:

1. **Markdown Mode** (default): Content is parsed and rendered as formatted HTML with syntax highlighting, math support, and styled elements.

2. **Raw Mode**: Content is displayed as plain text, preserving the exact response including all Markdown syntax, newlines, and whitespace.

This feature provides users with flexibility to view LLM responses as formatted content or as verbatim source text.

### Related Docs

- **[Streaming Implementation Details](./16-streaming-implementation-details.md)**: Stable/unstable buffering that rendering modes integrate with
- **[Design System](./13-design-system.md)**: CSS tokens used by render mode toggle and raw text styling
- **[User Experience](./04-user-experience-and-context-management.md)**: Progressive disclosure and quick action patterns

---

## User Interface

### Toggle Design

Each assistant message displays a segmented toggle in the message header:

```
┌─────────────────────────────────────────────┐
│  Response                    [MD] [Raw]     │
│  ─────────────────────────────────────────  │
│  Model: gpt-4  Tokens: 150 in, 450 out      │
├─────────────────────────────────────────────┤
│                                             │
│  [Rendered content based on selected mode]  │
│                                             │
└─────────────────────────────────────────────┘
```

**Toggle Buttons:**
- **MD**: Switches to Markdown view (formatted rendering)
- **Raw**: Switches to raw text view (verbatim display)

**Accessibility:**
- Keyboard accessible (Tab to focus, Enter/Space to activate)
- Tooltip on hover explaining the current action
- ARIA attributes (`role="group"`, `aria-pressed`) for screen readers
- Focus-visible outline using `--accent-color`

### Default Preference

The default render mode for new assistant messages can be configured:

| Setting | Storage | Options |
|---------|---------|---------|
| `defaultRenderMode` | localStorage | `'markdown'` (default), `'raw'` |

- New messages inherit the global default on load
- Per-message toggles override the default temporarily (not persisted per-message)

---

## Architecture

### Rendering Pipeline

Location: `src/ui/rendering/index.ts`

The rendering pipeline provides a unified interface for message rendering:

```
Input: message text + render mode + metadata
                    ↓
        ┌─────────────────────┐
        │  normalizeMarkdown  │ ← Future extension point (currently no-op)
        └─────────────────────┘
                    ↓
    ┌───────────────┴───────────────┐
    │                               │
┌───▼────┐                    ┌─────▼─────┐
│Markdown│                    │    Raw    │
│ Parser │                    │  Escaper  │
└───┬────┘                    └─────┬─────┘
    │                               │
    ▼                               ▼
┌────────┐                    ┌───────────┐
│DOMPurify                    │ HTML wrap │
│Sanitize│                    │ (no parse)│
└───┬────┘                    └─────┬─────┘
    │                               │
    └───────────────┬───────────────┘
                    ↓
        Output: { html, mode }
```

### API

```typescript
import { renderMessage, RenderMode } from '../rendering';

const result = renderMessage(text, {
  mode: 'markdown', // or 'raw'
  metadata: {
    isStreaming: true,
    provider: 'openai',
    model: 'gpt-4'
  }
});

// result.html contains the rendered output
// result.mode confirms which mode was used
```

### Key Functions

| Function | Description |
|----------|-------------|
| `renderMessage(text, options)` | Main rendering function, returns `{ html, mode }` |
| `renderMarkdown(text, isStreaming?)` | Convenience wrapper for markdown-only rendering |
| `renderRaw(text)` | Convenience wrapper for raw text rendering |
| `normalizeMarkdown(text, options?)` | Pre-processing hook (currently no-op) |
| `escapeHtml(text)` | Escapes HTML entities for safe display |

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `RenderModeToggle` | `src/ui/components/chat/message-stream/RenderModeToggle.svelte` | Toggle button UI |
| `MessageStream` | `src/ui/components/chat/MessageStream.svelte` | LLM response tab rendering |
| `ChatMessage` | `src/ui/components/chat/ChatMessage.svelte` | Chat panel message rendering |

### Stores

| Store | Location | Purpose |
|-------|----------|---------|
| `defaultRenderMode` | `src/ui/stores/config.ts` | Persisted default preference |

---

## Streaming Integration

The rendering pipeline integrates with the stable/unstable buffer pattern from [Streaming Implementation Details](./16-streaming-implementation-details.md):

**Markdown Mode:**
```typescript
function updateBuffers() {
  // Split by last blank line as boundary
  const splitIdx = fullText.lastIndexOf('\n\n');
  const stableMd = splitIdx === -1 ? '' : fullText.slice(0, splitIdx);
  const unstableMd = splitIdx === -1 ? fullText : fullText.slice(splitIdx);

  stableHtml = renderMessage(stableMd, { mode: 'markdown', ... }).html;
  unstableHtml = renderMessage(unstableMd, { mode: 'markdown', ... }).html;
}
```

**Raw Mode:**
```typescript
function updateBuffers() {
  // No splitting needed - render all as single block
  stableHtml = '';
  unstableHtml = renderMessage(fullText, { mode: 'raw', ... }).html;
}
```

Both modes use the same `requestAnimationFrame` scheduling for performance.

---

## Future Extension: Markdown Normalization

The rendering pipeline includes a placeholder for markdown normalization/smoothing:

```typescript
// src/ui/rendering/index.ts
export function normalizeMarkdown(text: string, options?: { isStreaming?: boolean }): string {
  // Currently a no-op - future implementations go here
  return text;
}
```

### Planned Heuristics

The `normalizeMarkdown` function is the designated location for these future improvements:

| Heuristic | Description |
|-----------|-------------|
| **Fence Length Normalization** | Standardize code fence backtick counts; handle mixed styles (backticks vs tildes) |
| **Auto-closing Unclosed Fences** | During streaming, temporarily close unclosed code blocks for proper rendering |
| **List Repair** | Fix incomplete list items at streaming boundaries; handle nested list indentation |
| **Streaming Boundary Stabilization** | Buffer incomplete markdown constructs until they're complete |

### Implementation Constraints

When implementing normalization heuristics:

- **Idempotency**: Normalizing twice should produce the same result
- **Semantic Preservation**: Never alter the meaning of the content
- **Performance**: Must be fast as it's called on every render during streaming
- **Reversibility**: Raw mode should always show the original, un-normalized text

---

## Known Edge Cases

### Nested Fences

When markdown contains code examples that include markdown fences:

**Problem**: Triple backticks inside a code block can break rendering.

**Solution in Markdown mode**: Use 4+ backticks for the outer fence:
````markdown
````markdown
```javascript
const x = 1;
```
````
````

**Solution with Raw mode**: View the exact source to understand the nesting.

### Copy Fidelity

Raw mode is particularly useful for:
- Copying code snippets exactly as the LLM generated them
- Debugging markdown rendering issues
- Preserving whitespace in formatted output
- Viewing special characters that might be rendered differently

**Note:** Copy-to-clipboard always copies the original text (not rendered HTML) in both modes, ensuring copy fidelity regardless of render mode.

### Streaming Considerations

- During streaming, both modes update smoothly as tokens arrive
- Markdown mode may show temporary rendering artifacts at streaming boundaries (addressed by future normalization)
- Raw mode shows exactly what's been received, without any processing artifacts

---

## Security

### Markdown Mode

All rendered HTML is sanitized using DOMPurify:

```typescript
DOMPurify.sanitize(htmlWithMath, {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'h1'-'h6',
    'ul', 'ol', 'li', 'blockquote', 'a', 'table', ...
    // KaTeX math elements
  ],
  ALLOWED_ATTR: ['href', 'src', 'class', 'aria-hidden', ...]
});
```

- Script tags and event handlers are stripped
- Only safe HTML elements and attributes preserved
- No javascript: URLs allowed

### Raw Mode

- All text is HTML-escaped before display using `escapeHtml()`
- No interpretation of HTML tags
- Content displayed exactly as received
- Wrapped in `<div class="raw-text-content">` for styling

---

## CSS Styling

Styles follow the [Design System](./13-design-system.md) tokens:

**Toggle Button:**
```css
.toggle-btn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  border-radius: var(--radius-default);
  transition: all var(--transition-fast);
}

.toggle-btn.active {
  background-color: var(--accent-color);
  color: var(--bg-primary);
}
```

**Raw Text Display:**
```css
.response-content.raw-mode {
  font-family: var(--font-mono);
  background-color: var(--bg-secondary);
}

.raw-text-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: var(--font-mono);
  line-height: var(--leading-relaxed);
}
```

---

## Testing

Tests are located in `tests/rendering/render-message.test.ts`:

```bash
npm test -- tests/rendering/render-message.test.ts
```

**Coverage:**

| Category | Tests |
|----------|-------|
| Markdown rendering | Headings, lists, code fences (backticks & tildes), tables, inline code, blockquotes |
| Raw text | HTML escaping, markdown preservation, whitespace handling |
| Streaming | Incremental append behavior in both modes |
| Security | XSS prevention, dangerous HTML stripping |
| Edge cases | Empty strings, long lines, unicode, nested fences |

---

## Summary

The message rendering modes feature provides:

1. **User control** over how LLM responses are displayed
2. **Extensible architecture** for future markdown normalization
3. **Streaming compatibility** with existing buffer patterns
4. **Security** through consistent sanitization
5. **Accessibility** via keyboard navigation and ARIA attributes

Raw mode serves as both a user feature (copy fidelity, debugging) and a safety valve (view exact content when markdown rendering fails).
