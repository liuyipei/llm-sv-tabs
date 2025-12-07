# Token Streaming and API Key Provider Architecture

## Overview

The application implements a flexible provider architecture that supports 11 different LLM providers with consistent token streaming capabilities. The design emphasizes extensibility, caching, and real-time response delivery.

## Provider Architecture

### Base Provider Contract

All providers inherit from an abstract base class (`base-provider.ts`) that defines the contract:

```typescript
abstract class BaseProvider {
  // Non-streaming query
  abstract query(messages: Message[], options?: QueryOptions): Promise<QueryResponse>;

  // Streaming query with chunk callback
  abstract queryStream(
    messages: Message[],
    options: QueryOptions,
    onChunk: (chunk: string) => void
  ): Promise<QueryResponse>;

  // Provider metadata
  abstract getAvailableModels(): string[];
  abstract validate(): Promise<boolean>;
  abstract getCapabilities(): ProviderCapabilities;
}
```

### Supported Providers

The system supports 11 providers via `provider-factory.ts`:

1. **OpenAI** - GPT-4, GPT-3.5-turbo
2. **Anthropic** - Claude 3.5 Sonnet, Claude 3 Opus/Haiku
3. **Google Gemini** - Gemini Pro, Gemini Pro Vision
4. **xAI** - Grok models
5. **OpenRouter** - Unified API for multiple providers
6. **Fireworks** - Open-source models
7. **Ollama** - Local model serving
8. **LMStudio** - Local model serving
9. **vLLM** - High-performance local serving
10. **Minimax** - Chinese LLM provider
11. **local-openai-compatible** - Generic OpenAI-compatible endpoint

### Provider Factory Pattern

The factory uses a singleton pattern with intelligent caching:

```typescript
class ProviderFactory {
  private static cache: Map<string, BaseProvider> = new Map();

  static getProvider(
    type: ProviderType,
    apiKey: string,
    endpoint?: string
  ): BaseProvider {
    const cacheKey = `${type}:${apiKey}:${endpoint}`;

    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.createProvider(type, apiKey, endpoint));
    }

    return this.cache.get(cacheKey)!;
  }
}
```

**Cache Key Strategy**: `${providerType}:${apiKey}:${endpoint}`

This ensures:
- Same provider instances are reused across queries
- Different API keys get separate instances
- Custom endpoints (for local providers) are isolated

## Token Streaming Implementation

### Server-Sent Events (SSE) Pattern

Both OpenAI and Anthropic use SSE for streaming, but with different event formats.

#### Anthropic Streaming

```typescript
async queryStream(messages, options, onChunk) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': this.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ messages, stream: true, ... }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // Keep incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));

        if (data.type === 'content_block_delta') {
          const delta = data.delta?.text || '';
          onChunk(delta);  // Push to UI immediately
        }
      }
    }
  }
}
```

**Event Format**:
```
data: {"type":"content_block_start","index":0,...}
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}
data: {"type":"content_block_stop","index":0}
```

#### OpenAI Streaming

Similar pattern, but different JSON structure:

```typescript
const data = JSON.parse(line.slice(6));
if (data.choices?.[0]?.delta?.content) {
  onChunk(data.choices[0].delta.content);
}
```

**Event Format**:
```
data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}
data: [DONE]
```

### Streaming Flow

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

### IPC Streaming Bridge

The main process sends chunks via IPC:

```typescript
// main.ts
const onChunk = (chunk: string) => {
  mainWindow.webContents.send('llm-stream-chunk', {
    tabId: tabId,
    chunk: chunk,
  });
};

await provider.queryStream(messages, options, onChunk);
```

The UI listens for chunks:

```typescript
// ipc-bridge.ts
window.electronAPI.on('llm-stream-chunk', (event) => {
  if (event.tabId === activeTabId) {
    messageStreamStore.appendChunk(event.chunk);
  }
});
```

### Data Persistence Architecture

**Main Process as Source of Truth**

Streaming data persists in the main process, independent of UI component lifecycle. This ensures zero data loss during tab switching or component unmounting.

**Key Design Principles:**

1. **Accumulation in Main Process**:
   - Provider streams chunks → main process accumulates in `tab.metadata.response`
   - Full response is built incrementally during streaming
   - Stored in tab metadata, which persists across navigation

2. **Fire-and-Forget Broadcasting**:
   - Each chunk is sent via IPC event (`'llm-stream-chunk'`)
   - Events are broadcast whether UI components are listening or not
   - Main process doesn't wait for acknowledgment

3. **Optional Component Subscription**:
   - `MessageStream` component subscribes for real-time viewing
   - On mount, loads existing data from `metadata.response` first
   - Then subscribes to new chunks for live updates
   - Subscription is purely for UI updates, not data persistence

4. **Survives Navigation**:
   - User can navigate away during streaming
   - Streaming continues in main process
   - Data accumulates in `tab.metadata.response`
   - When user returns, component remounts and loads full response

**Implementation in main.ts:**

```typescript
// Streaming continues regardless of component state
const response = await provider.queryStream(messages, options, (chunk) => {
  tabManager!.sendStreamChunk(tabId, chunk);  // Fire-and-forget broadcast
});

// After streaming completes, save full response to metadata
const tab = tabManager.getTab(tabId);
if (tab?.metadata) {
  tab.metadata.response = response.response;  // Source of truth
  tab.metadata.isStreaming = false;
  // ... other metadata
}
```

**Implementation in MessageStream.svelte:**

```typescript
onMount(() => {
  // 1. Load existing data FIRST (source of truth)
  if (metadata?.response) {
    fullText = metadata.response;
    updateBuffers();
  }

  // 2. THEN subscribe to live chunks (optional real-time updates)
  unsubscribe = window.electronAPI.onLLMChunk(({ tabId: incomingId, chunk }) => {
    if (incomingId !== tabId) return;
    fullText += chunk;
    scheduleRender();
  });
});
```

This architecture prevents the common bug where conversations disappear when navigating away during streaming. See `design/06-round-trip-test-pattern.md` for testing strategies.

### Diagnostic Note: Streaming Completion & Duplicate Chunks

When a renderer mounts mid-stream, it may already receive the latest `metadata.response` from the main-process store **and** continue to hear live `llm-stream-chunk` events. Without guardrails, the first chunk after mount can be appended twice (once from the metadata preload and once from the live event), which surfaces as duplicated opening tokens (for example, `Hello!Hello!`).

Mitigations now baked into `MessageStream`:

- **Metadata-first sync with memoization**: The component always seeds `fullText` from `metadata.response`, but only when the value changes from the last applied snapshot. This keeps the renderer aligned with the main-process source of truth after any tab-update event.
- **Chunk deduplication**: Each incoming chunk is skipped if the current `fullText` already ends with the same substring, preventing double-append scenarios when metadata merges race with a late IPC chunk.
- **Single response container**: The response header and streaming body now live inside one teal-accented card so live tokens render inside the same visual container as the finalized text, matching the debug view.

## API Key Management

### Storage Strategy

API keys are stored per-provider using Svelte persistent stores:

```typescript
// config.ts
export const apiKeys = persistentWritable<Record<ProviderType, string>>(
  'apiKeys',
  {} // Initial value
);

// Backed by localStorage in browser
localStorage.setItem('apiKeys', JSON.stringify({
  'openai': 'sk-...',
  'anthropic': 'sk-ant-...',
  'gemini': 'AIza...',
}));
```

### Helper Functions

```typescript
export function setApiKey(provider: ProviderType, key: string) {
  apiKeys.update(keys => ({ ...keys, [provider]: key }));
}

export function getApiKey(provider: ProviderType): string | undefined {
  return get(apiKeys)[provider];
}
```

### Security Considerations

- **Main Process Only**: API keys are passed from renderer to main process, but actual API calls are made in the main process
- **No Logging**: API keys are excluded from debug logs
- **Memory Only in Renderer**: Keys are loaded into memory but stored in localStorage (encrypted by Electron in production builds)

## Token Counting

### Response Metadata

Each LLM response includes token usage:

```typescript
interface QueryResponse {
  response: string;
  tokensIn?: number;
  tokensOut?: number;
  model: string;
  fullQuery: string;  // Including context from selected tabs
}
```

### Provider-Specific Counting

**Anthropic**:
```typescript
const data = await response.json();
return {
  response: data.content[0].text,
  tokensIn: data.usage?.input_tokens,
  tokensOut: data.usage?.output_tokens,
  model: data.model,
};
```

**OpenAI**:
```typescript
return {
  response: data.choices[0].message.content,
  tokensIn: data.usage?.prompt_tokens,
  tokensOut: data.usage?.completion_tokens,
  model: data.model,
};
```

### Token Display

Tokens are stored in tab metadata and displayed in the UI:

```typescript
interface TabMetadata {
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  query?: string;
  fullQuery?: string;  // With context
}
```

## Error Handling

### Provider Validation

Each provider implements a `validate()` method:

```typescript
async validate(): Promise<boolean> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Streaming Error Recovery

```typescript
try {
  await provider.queryStream(messages, options, onChunk);
} catch (error) {
  // Update tab with error state
  await tabManager.updateLLMResponseTab(tabId, undefined, {
    error: error.message,
    isStreaming: false,
  });

  // Notify user
  mainWindow.webContents.send('llm-stream-error', {
    tabId: tabId,
    error: error.message,
  });
}
```

## Performance Optimizations

### 1. Provider Caching

Reusing provider instances avoids:
- Re-parsing configurations
- Re-creating HTTP clients
- Re-validating API keys

### 2. Incremental Streaming

Chunks are sent as soon as they arrive:
- **NOT buffered**: Each delta is immediately forwarded to UI
- **Backpressure**: Reader stream naturally handles flow control
- **Concurrency**: Multiple queries can stream simultaneously to different tabs

### 3. Token Decoder

```typescript
const decoder = new TextDecoder();

// Stream: true to handle incomplete UTF-8 sequences
buffer += decoder.decode(value, { stream: true });
```

This prevents garbled text when chunks split multi-byte characters.

## Extension Points

### Adding a New Provider

1. Create `src/main/providers/my-provider.ts`:
   ```typescript
   export class MyProvider extends BaseProvider {
     async query(messages, options) { ... }
     async queryStream(messages, options, onChunk) { ... }
     getAvailableModels() { return ['my-model-1', 'my-model-2']; }
   }
   ```

2. Register in `provider-factory.ts`:
   ```typescript
   case 'my-provider':
     return new MyProvider(apiKey, endpoint);
   ```

3. Add to `types.ts`:
   ```typescript
   export type ProviderType = 'openai' | 'anthropic' | ... | 'my-provider';
   ```

4. Update UI configuration in `Settings.svelte`

### Custom Streaming Formats

If a provider uses WebSockets or gRPC instead of SSE:

```typescript
async queryStream(messages, options, onChunk) {
  const ws = new WebSocket(this.endpoint);

  ws.on('message', (data) => {
    const parsed = JSON.parse(data);
    if (parsed.delta) {
      onChunk(parsed.delta);
    }
  });

  ws.send(JSON.stringify({ messages, stream: true }));
}
```

## Future Considerations

1. **Rate Limiting**: Track requests per provider to respect API limits
2. **Cost Tracking**: Calculate costs based on token usage and provider pricing
3. **Retry Logic**: Automatic retry with exponential backoff for failed streams
4. **Provider Health**: Monitor availability and switch to fallback providers
5. **Batch Queries**: Support multiple queries in parallel with resource pooling

## PR comment snippet (streaming fix)

Use this block to summarize the current streaming improvements in a review thread:

```
Summary: Streaming now de-dupes initial tokens when metadata snapshots and chunk events overlap, and live tokens render inside the teal response card to match the final view.

Details:
- Tab store memoizes the last response text and drops duplicate chunks rather than re-appending the opening tokens.
- MessageStream renders streaming content inside the unified Response card so the layout stays consistent with debug/final render states.
- Added logging and latch context to the token streaming design note for future investigations.

Testing: npm test
```
