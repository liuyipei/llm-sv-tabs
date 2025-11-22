# Streaming LLM Tokens Migration Guide

## Overview

This document outlines the migration to support streaming LLM responses using a **hybrid architecture**: keeping BrowserView for webpage/notes tabs while migrating LLM response tabs to Svelte components.

## Architecture: Hybrid Tab Rendering

### Current State
All tabs use `BrowserView`:
- **Webpages**: Load real URLs via `view.webContents.loadURL(url)`
- **Notes/Uploads**: Load data URIs with HTML templates
- **LLM Responses**: Load data URIs with markdown-rendered HTML (full page reload on update)

### Target State
Hybrid rendering:
- **Webpages**: Keep `BrowserView` (essential for loading real websites)
- **Notes/Uploads**: Keep `BrowserView` (built-in PDF viewer, image handling)
- **LLM Responses**: **Migrate to Svelte components** (enables efficient streaming)

## Implementation Plan

### Estimated Effort: 20-29 hours (2.5-3.5 days)

| Task | Hours | Files |
|------|-------|-------|
| Provider streaming (11 providers) | 4-6 | `src/main/providers/*.ts` |
| IPC streaming events | 3-4 | `src/main/preload.ts`, `src/ui/lib/ipc-bridge.ts` |
| TabManager hybrid support | 4-6 | `src/main/tab-manager.ts` |
| Svelte MessageStream component | 2-3 | `src/ui/components/chat/MessageStream.svelte` |
| Layout changes (show/hide) | 3-4 | `src/ui/routes/+page.svelte` or main view |
| Testing | 4-6 | All providers + edge cases |

---

## Implementation Details

### 1. TabManager: Hybrid Behavior

#### Key Changes

**Modified Tab Interface** (`src/main/tab-manager.ts`):
```typescript
interface TabWithView extends Tab {
  view?: BrowserView;  // Optional! Only for BrowserView tabs
  component?: 'llm-response' | 'note'; // For Svelte-rendered tabs
}
```

**LLM Response Tab Creation** (no BrowserView):
```typescript
openLLMResponseTab(query: string): { tabId: string } {
  const tabId = this.createTabId();

  const tab: TabWithView = {
    id: tabId,
    title: 'Loading...',
    url: `llm-response://${Date.now()}`,
    type: 'notes',  // Or create new 'llm-response' type
    component: 'llm-response', // No BrowserView!
    metadata: {
      isLLMResponse: true,
      query: query,
      isStreaming: true,
    },
    created: Date.now(),
  };

  this.tabs.set(tabId, tab);
  this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

  return { tabId };
}
```

**Active Tab Switching**:
```typescript
setActiveTab(tabId: string): void {
  const tab = this.tabs.get(tabId);
  if (!tab) return;

  // Hide previous BrowserView
  if (this.activeBrowserView) {
    this.mainWindow.removeBrowserView(this.activeBrowserView);
  }

  if (tab.view) {
    // Traditional BrowserView tab (webpage, notes, uploads)
    this.mainWindow.addBrowserView(tab.view);
    this.updateBrowserViewBounds();
    this.activeBrowserView = tab.view;
  } else {
    // Svelte component tab (LLM responses)
    this.activeBrowserView = null;
    // Renderer shows Svelte component in the content area
  }

  this.activeTabId = tabId;
  this.sendToRenderer('active-tab-changed', { id: tabId });
}
```

**Stream Chunk Update** (new method):
```typescript
sendStreamChunk(tabId: string, chunk: string): void {
  this.mainWindow.webContents.send('llm-stream-chunk', { tabId, chunk });
}
```

#### Gotchas
- **Future improvement**: Consider adding distinct `type: 'llm-response'` instead of overloading `'notes'`
- **Title updates**: When streaming starts/ends, update `tab.title` with model info and send `tab-title-updated` event
- **Metadata sync**: Keep `isStreaming` flag in sync as chunks arrive

---

### 2. Preload: IPC Streaming Bridge

**File**: `src/main/preload.ts`

**Add streaming listener**:
```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // ... existing API methods ...

  onLLMChunk(callback: (payload: { tabId: string; chunk: string }) => void) {
    const handler = (_event: unknown, payload: { tabId: string; chunk: string }) => {
      callback(payload);
    };
    ipcRenderer.on('llm-stream-chunk', handler);

    // Return unsubscribe function
    return () => ipcRenderer.removeListener('llm-stream-chunk', handler);
  }
});
```

**Update type definitions** (`src/ui/lib/ipc-bridge.ts`):
```typescript
export interface IPCBridgeAPI {
  // ... existing methods ...

  onLLMChunk(callback: (payload: { tabId: string; chunk: string }) => void): () => void;
}
```

---

### 3. Provider Layer: Add Streaming Support

**File**: `src/main/providers/base-provider.ts`

**Add abstract streaming method**:
```typescript
export abstract class BaseProvider {
  // ... existing methods ...

  /**
   * Stream a query to the LLM provider
   * @param onChunk - Callback invoked for each chunk of text
   */
  abstract queryStream(
    messages: Array<{ role: string; content: string }>,
    options: QueryOptions | undefined,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse>;
}
```

**Example: Anthropic Provider** (`src/main/providers/anthropic-provider.ts`):

```typescript
async queryStream(
  messages: Array<{ role: string; content: string }>,
  options: QueryOptions | undefined,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  const startTime = Date.now();

  if (!this.apiKey && !options?.apiKey) {
    return { response: '', error: 'Anthropic API key is required' };
  }

  const apiKey = (options?.apiKey || this.apiKey)!;
  const model = options?.model || this.model || 'claude-3-5-sonnet-20241022';
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 4096;

  try {
    const systemMessages = messages.filter(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${AnthropicProvider.API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: userMessages,
        system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
        temperature,
        max_tokens: maxTokens,
        stream: true, // Enable streaming!
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6); // Remove 'data: ' prefix
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta?.text || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    const responseTime = Date.now() - startTime;

    return {
      response: fullText,
      // Note: streaming doesn't return usage in every event
      // Consider calling non-streaming endpoint afterward for token counts
      // or parse from final message_stop event
      responseTime,
      model,
    };
  } catch (error) {
    return {
      response: '',
      error: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime,
    };
  }
}
```

**Repeat for all providers** (OpenAI, Gemini, xAI, OpenRouter, Fireworks, Ollama, LMStudio, vLLM, Minimax, local-openai-compatible)

---

### 4. Main Process: IPC Handler for Streaming

**File**: `src/main/main.ts`

**Replace `send-query` handler**:
```typescript
ipcMain.handle('send-query-stream', async (_event, query: string, options?: QueryOptions): Promise<{ tabId: string }> => {
  if (!options?.provider) {
    throw new Error('Provider is required');
  }

  // Get tab ID from options or create new one
  const tabId = options.tabId || tabManager!.openLLMResponseTab(query).tabId;

  try {
    const provider = ProviderFactory.getProvider(
      options.provider,
      options.apiKey,
      options.endpoint
    );

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // Extract content from selected tabs
    let contextContent = '';
    if (tabManager && options.selectedTabIds && options.selectedTabIds.length > 0) {
      const extractedContents: ExtractedContent[] = [];

      for (const selectedTabId of options.selectedTabIds) {
        const view = tabManager.getTabView(selectedTabId);
        if (view) {
          try {
            const content = await ContentExtractor.extractFromTab(
              view,
              selectedTabId,
              options.includeMedia ?? false
            );
            extractedContents.push(content);
          } catch (error) {
            console.error(`Failed to extract content from tab ${selectedTabId}:`, error);
          }
        }
      }

      if (extractedContents.length > 0) {
        contextContent = extractedContents
          .map((content) => {
            const dom = content.content as any;
            return `
Tab: ${content.title}
URL: ${content.url}

${dom.mainContent || ''}
            `.trim();
          })
          .join('\n\n---\n\n');

        contextContent = `Here is the content from the selected tabs:\n\n${contextContent}\n\n`;
      }
    }

    const fullQuery = contextContent ? `${contextContent}${query}` : query;
    messages.push({ role: 'user', content: fullQuery });

    // Stream response
    const response = await provider.queryStream(messages, options, (chunk) => {
      // Send chunk to renderer
      tabManager!.sendStreamChunk(tabId, chunk);
    });

    // Update tab metadata after streaming completes
    if (tabManager) {
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.response = response.response;
        tab.metadata.isStreaming = false;
        tab.metadata.tokensIn = response.tokensIn;
        tab.metadata.tokensOut = response.tokensOut;
        tab.metadata.model = response.model;
        tab.metadata.fullQuery = fullQuery !== query ? fullQuery : undefined;

        // Update title
        const modelName = response.model || '';
        const tokensIn = response.tokensIn || 0;
        const tokensOut = response.tokensOut || 0;

        if (modelName && tokensIn > 0 && tokensOut > 0) {
          tab.title = `Response ${modelName} up: ${tokensIn.toLocaleString()} down: ${tokensOut.toLocaleString()}`;
        } else if (modelName) {
          tab.title = `Response ${modelName}`;
        }

        tabManager.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });
      }
    }

    return { tabId };
  } catch (error) {
    // Send error to tab
    if (tabManager) {
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.error = error instanceof Error ? error.message : String(error);
        tab.metadata.isStreaming = false;
      }
    }
    throw error;
  }
});
```

---

### 5. Svelte Component: MessageStream

**File**: `src/ui/components/chat/MessageStream.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  declare global {
    interface Window {
      electron?: {
        onLLMChunk: (
          cb: (payload: { tabId: string; chunk: string }) => void
        ) => () => void;
      };
    }
  }

  export let tabId: string;

  let container: HTMLDivElement | null = null;

  // Svelte 5 runes state
  let fullText = $state('');
  let stableHtml = $state('');
  let unstableHtml = $state('');

  let unsubscribe: (() => void) | null = null;
  let renderScheduled = false;

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

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      updateBuffers();
    });
  }

  onMount(() => {
    if (!window.electron?.onLLMChunk) return;

    unsubscribe = window.electron.onLLMChunk(({ tabId: incomingId, chunk }) => {
      if (incomingId !== tabId) return;
      fullText += chunk;
      scheduleRender();
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>

<div class="llm-message-stream" bind:this={container}>
  <div class="stable" {@html stableHtml}></div>
  <div class="unstable" {@html unstableHtml}></div>
</div>

<style>
  .llm-message-stream {
    overflow-y: auto;
    height: 100%;
    white-space: pre-wrap;
    font-family: system-ui, sans-serif;
    padding: 0.75rem 1rem;
    background-color: #252526;
    color: #d4d4d4;
  }

  .unstable {
    opacity: 0.96;
  }

  /* Inherit markdown styles from existing theme */
  :global(.llm-message-stream h1),
  :global(.llm-message-stream h2),
  :global(.llm-message-stream h3),
  :global(.llm-message-stream h4),
  :global(.llm-message-stream h5),
  :global(.llm-message-stream h6) {
    color: #ffffff;
    margin-top: 24px;
    margin-bottom: 16px;
    font-weight: 600;
    line-height: 1.25;
  }

  :global(.llm-message-stream h1) {
    font-size: 2em;
    border-bottom: 1px solid #3e3e42;
    padding-bottom: 0.3em;
  }

  :global(.llm-message-stream h2) {
    font-size: 1.5em;
    border-bottom: 1px solid #3e3e42;
    padding-bottom: 0.3em;
  }

  :global(.llm-message-stream p) {
    margin-top: 0;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream pre) {
    background-color: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream code) {
    background-color: #3c3c3c;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 85%;
  }

  :global(.llm-message-stream pre code) {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 100%;
  }

  :global(.llm-message-stream blockquote) {
    border-left: 4px solid #3e3e42;
    padding-left: 16px;
    color: #8c8c8c;
    margin: 0 0 16px 0;
  }

  :global(.llm-message-stream ul),
  :global(.llm-message-stream ol) {
    padding-left: 2em;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream li) {
    margin-bottom: 4px;
  }

  :global(.llm-message-stream a) {
    color: #3794ff;
    text-decoration: none;
  }

  :global(.llm-message-stream a:hover) {
    text-decoration: underline;
  }

  :global(.llm-message-stream table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 16px;
  }

  :global(.llm-message-stream th),
  :global(.llm-message-stream td) {
    border: 1px solid #3e3e42;
    padding: 8px 12px;
    text-align: left;
  }

  :global(.llm-message-stream th) {
    background-color: #2d2d30;
    font-weight: 600;
  }

  :global(.llm-message-stream img) {
    max-width: 100%;
    height: auto;
  }
</style>
```

---

### 6. Main Layout: Conditional Rendering

**File**: Find your main content area (likely `src/ui/routes/+page.svelte` or similar)

**Add conditional rendering**:
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
    <!-- BrowserView renders here (managed by TabManager in main process) -->
    <div class="browser-view-placeholder"></div>
  {/if}
</div>

<style>
  .content-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .browser-view-placeholder {
    width: 100%;
    height: 100%;
  }
</style>
```

---

### 7. UI Component Updates

**File**: `src/ui/components/chat/InputControls.svelte`

**Update query submission to use streaming**:
```typescript
async function handleQuerySubmit(): Promise<void> {
  if (!$queryInput.trim()) return;

  const query = $queryInput.trim();
  $queryInput = '';

  if (ipc) {
    isLoading.set(true);

    try {
      const options: QueryOptions = {
        provider: $provider,
        model: $model || undefined,
        apiKey: $apiKeys[$provider] || undefined,
        endpoint: $endpoint || undefined,
        temperature: $temperature,
        maxTokens: $maxTokens,
        systemPrompt: $systemPrompt || undefined,
        selectedTabIds: Array.from($selectedTabs),
      };

      // Use new streaming handler
      const { tabId } = await ipc.sendQueryStream(query, options);

      // Record model usage when stream completes
      // (You might want to listen for a 'stream-complete' event instead)

    } catch (error) {
      console.error('Failed to send query:', error);
    } finally {
      isLoading.set(false);
    }
  }
}
```

---

## Gotchas & Important Notes

### 1. Tab Type Consideration
Current implementation uses `type: 'notes'` for LLM responses. Consider creating a distinct type:
```typescript
export type TabType = 'webpage' | 'pdf' | 'notes' | 'upload' | 'llm-response';
```

### 2. Code Fence Awareness
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

### 3. Token Counting with Streaming
Most streaming APIs don't return token counts in delta events. Options:
- Parse from final `message_stop` event (Anthropic)
- Make a follow-up non-streaming call just for metadata
- Use client-side token estimation library (e.g., tiktoken)

### 4. Error Handling Mid-Stream
If stream fails partway through:
- Keep partial text rendered
- Show error banner
- Mark `isStreaming: false`
- Store error in `metadata.error`

### 5. Syntax Highlighting
Current implementation uses basic `marked.parse()`. To add syntax highlighting:
```typescript
import hljs from 'highlight.js';

marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {}
    }
    return hljs.highlightAuto(code).value;
  }
});
```

Include CSS: `import 'highlight.js/styles/github-dark.css';`

### 6. Math Rendering (KaTeX)
If you need math support (like current template has):
```typescript
import katex from 'katex';
import 'katex/dist/katex.min.css';

function processMath(html: string): string {
  // Display math ($$...$$)
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true });
    } catch (e) {
      return `<span class="math-error">$$${math}$$</span>`;
    }
  });

  // Inline math ($...$)
  html = html.replace(/\$([^$]+)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false });
    } catch (e) {
      return `<span class="math-error">$${math}$</span>`;
    }
  });

  return html;
}

// In updateBuffers():
stableHtml = DOMPurify.sanitize(processMath(marked.parse(stableMd)));
unstableHtml = DOMPurify.sanitize(processMath(marked.parse(unstableMd)));
```

---

## Testing Checklist

### Provider Testing
- [ ] Anthropic streaming works
- [ ] OpenAI streaming works
- [ ] Test all 11 providers
- [ ] Error handling (invalid API key, network failure)
- [ ] Mid-stream disconnection recovery

### UI Testing
- [ ] Auto-scroll works correctly
- [ ] Switching tabs during streaming
- [ ] Multiple concurrent streams
- [ ] Markdown rendering (code blocks, lists, tables)
- [ ] Syntax highlighting
- [ ] Math rendering (if implemented)
- [ ] Long responses (>10k tokens)

### Edge Cases
- [ ] Empty responses
- [ ] Response with only whitespace
- [ ] Unicode/emoji handling
- [ ] Very rapid chunks (throttling needed?)
- [ ] Browser refresh during streaming

### Integration
- [ ] Session persistence (don't save incomplete streams)
- [ ] Tab closure during streaming
- [ ] Window resize during streaming
- [ ] DevTools inspection works

---

## Future Enhancements

1. **Stream Cancellation**: Add abort controller to cancel in-flight requests
2. **Typing Indicator**: Add blinking cursor to unstable region
3. **Chunk Throttling**: Debounce renders if chunks arrive too fast
4. **Replay**: Store chunks for debugging/replay
5. **Diff Highlighting**: Highlight newly added text briefly
6. **Progressive Enhancement**: Fall back to non-streaming if unsupported

---

## Migration Steps

1. **Phase 1**: Provider Layer (4-6 hours)
   - Add `queryStream()` to base provider
   - Implement for Anthropic + OpenAI first
   - Test manually with console logs

2. **Phase 2**: IPC Bridge (3-4 hours)
   - Add preload streaming listener
   - Update IPC types
   - Test with mock chunks from main process

3. **Phase 3**: TabManager Hybrid (4-6 hours)
   - Modify tab creation logic
   - Update `setActiveTab()` to handle both types
   - Add `sendStreamChunk()` method

4. **Phase 4**: Svelte Component (2-3 hours)
   - Create `MessageStream.svelte`
   - Test with mock data
   - Add styling from existing template

5. **Phase 5**: Layout Integration (3-4 hours)
   - Add conditional rendering to main view
   - Update `InputControls.svelte`
   - Wire up event handlers

6. **Phase 6**: Remaining Providers (1-3 hours)
   - Implement streaming for other 9 providers
   - Follow same pattern as Anthropic/OpenAI

7. **Phase 7**: Polish & Testing (4-6 hours)
   - Add syntax highlighting
   - Add math rendering (if needed)
   - Error handling
   - Edge case testing

---

## Rollback Plan

If streaming implementation has issues:

1. **Keep both code paths**: Add a config flag `enableStreaming: boolean`
2. **Graceful degradation**: Fall back to non-streaming if `queryStream()` fails
3. **Feature flag**: Environment variable `ENABLE_STREAMING=true/false`

```typescript
// In main.ts
const useStreaming = process.env.ENABLE_STREAMING === 'true';

if (useStreaming && provider.queryStream) {
  // Use streaming
} else {
  // Use original non-streaming
}
```

This allows testing in production with easy rollback.
