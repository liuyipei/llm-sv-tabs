# Streaming LLM Implementation Details

## Overview

This document describes technical implementation details for the hybrid tab rendering system that enables efficient streaming LLM responses.

## Hybrid Tab Architecture

### Tab Types and Rendering Strategy

The application uses a hybrid approach to render different types of tabs:

- **Webpages**: Use `WebContentsView` for loading real websites
- **Notes/Uploads**: Use `WebContentsView` for built-in PDF viewer and image handling
- **LLM Responses**: Use Svelte components for efficient streaming rendering

### TabManager Hybrid Behavior

Tabs have an optional `view` property that is only present for WebContentsView-based tabs:

```typescript
interface TabWithView extends Tab {
  view?: WebContentsView;  // Optional! Only for WebContentsView tabs
  component?: 'llm-response' | 'note'; // For Svelte-rendered tabs
}
```

**Active Tab Switching**:
```typescript
setActiveTab(tabId: string): void {
  const tab = this.tabs.get(tabId);
  if (!tab) return;

  // Hide previous WebContentsView
  if (this.activeWebContentsView) {
    this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
  }

  if (tab.view) {
    // Traditional WebContentsView tab (webpage, notes, uploads)
    this.mainWindow.contentView.addChildView(tab.view);
    this.updateWebContentsViewBounds();
    this.activeWebContentsView = tab.view;
  } else {
    // Svelte component tab (LLM responses)
    this.activeWebContentsView = null;
    // Renderer shows Svelte component in the content area
  }

  this.activeTabId = tabId;
  this.sendToRenderer('active-tab-changed', { id: tabId });
}
```

## MessageStream Component

### Stable/Unstable Markdown Buffering

The `MessageStream.svelte` component uses a two-buffer system to balance performance with user experience:

```svelte
let fullText = $state('');
let stableHtml = $state('');
let unstableHtml = $state('');

function updateBuffers() {
  // Simple block split: last blank line as boundary
  const splitIdx = fullText.lastIndexOf('\n\n');
  const stableMd = splitIdx === -1 ? '' : fullText.slice(0, splitIdx);
  const unstableMd = splitIdx === -1 ? fullText : fullText.slice(splitIdx);

  stableHtml = DOMPurify.sanitize(marked.parse(stableMd));
  unstableHtml = DOMPurify.sanitize(marked.parse(unstableMd));
  
  // Auto-scroll if user is near bottom
  if (container) {
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 32;
    if (nearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
```

**Benefits**:
- Stable content is rendered once and not re-rendered on each chunk
- Unstable content (last incomplete block) re-renders frequently
- Reduces markdown parsing overhead for long responses
- Provides smooth user experience with real-time updates

### Code Fence Boundary Detection

The simple `\n\n` boundary detection can split inside code blocks. Enhanced version:

```typescript
function findStableBoundary(text: string): number {
  let splitIdx = text.lastIndexOf('\n\n');

  // Check if we're inside a code fence
  const beforeSplit = text.slice(0, splitIdx);
  const fenceCount = (beforeSplit.match(/```/g) || []).length;

  if (fenceCount % 2 === 1) {
    // Inside fence, find previous boundary
    splitIdx = text.lastIndexOf('\n\n', splitIdx - 1);
  }

  return splitIdx;
}
```

### Chunk Deduplication

When a renderer mounts mid-stream, it may receive both the latest `metadata.response` from the main process AND live `llm-stream-chunk` events. To prevent duplicate chunks:

```typescript
unsubscribe = window.electronAPI.onLLMChunk(({ tabId: incomingId, chunk }) => {
  if (incomingId !== tabId) return;
  
  // Skip if chunk would duplicate existing text
  if (fullText.endsWith(chunk)) return;
  
  fullText += chunk;
  scheduleRender();
});
```

### Render Scheduling

Chunks arrive rapidly from streaming APIs. Debouncing prevents excessive renders:

```typescript
let renderScheduled = false;

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    updateBuffers();
  });
}
```

## Layout Integration

The main layout conditionally renders Svelte components or WebContentsView:

```svelte
<script lang="ts">
  import { activeTabId, activeTabs } from '$stores/tabs';
  import MessageStream from '$components/chat/MessageStream.svelte';

  $: activeTab = $activeTabId ? $activeTabs.get($activeTabId) : null;
  $: showSvelteContent = activeTab?.component === 'llm-response';
</script>

<div class="content-area">
  {#if showSvelteContent && activeTab}
    <MessageStream tabId={activeTab.id} />
  {:else}
    <!-- WebContentsView renders here (managed by TabManager in main process) -->
    <div class="browser-view-placeholder"></div>
  {/if}
</div>
```

## Token Counting with Streaming

Most streaming APIs don't return token counts in delta events. Strategies:

1. **Parse from final message_stop event** (Anthropic provides this)
2. **Make a follow-up non-streaming call** just for metadata (expensive)
3. **Client-side token estimation** using libraries like tiktoken

Current implementation uses option #1 when available, otherwise omits token counts for streaming responses.

## Error Handling Mid-Stream

If stream fails partway through:

- Keep partial text rendered (don't clear it)
- Show error banner to user
- Mark `isStreaming: false` in metadata
- Store error in `metadata.error`

## Performance Optimizations

### 1. RequestAnimationFrame Scheduling

Rather than rendering on every chunk, schedule renders on the next animation frame. Multiple chunks arriving within ~16ms are rendered in a single frame.

### 2. Selective Markdown Parsing

Only parse the unstable buffer. The stable buffer's HTML is cached and reused.

### 3. DOM Sanitization

DOMPurify sanitizes both buffers, but stable buffer is only sanitized once.

### 4. Auto-Scroll Detection

Only scroll to bottom if user is already near bottom (< 32px from end). This prevents jumping to bottom when user is reading earlier content.

## Streaming Flow Diagram

```
User Query
    ↓
InputControls.svelte
    ↓ (IPC)
main.ts → sendQuery handler
    ↓
Provider.queryStream(messages, options, onChunk)
    ↓
    ├─→ onChunk(delta) ──→ IPC event 'llm-stream-chunk' ──→ MessageStream.svelte
    ├─→ onChunk(delta) ──→ IPC event 'llm-stream-chunk' ──→ MessageStream.svelte
    └─→ onChunk(delta) ──→ IPC event 'llm-stream-chunk' ──→ MessageStream.svelte
    ↓
Final response with token counts
    ↓
updateLLMResponseTab (persist metadata)
```

## Related Documentation

- **[Token Streaming & API Providers](./01-token-streaming-and-providers.md)** - Provider architecture and streaming implementation
- **[Store Synchronization Across Processes](./07-store-synchronization-across-processes.md)** - IPC-based state management
- **[Round-Trip Test Pattern](./06-round-trip-test-pattern.md)** - Testing strategies for streaming persistence
