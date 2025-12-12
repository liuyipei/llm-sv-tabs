# Session Persistence Architecture

## Overview

The session persistence system saves and restores all user work across browser restarts. This includes webpages, notes, and LLM conversation tabs—ensuring that closing the browser doesn't lose any accumulated context or work.

## What Gets Persisted

| Tab Type | Component | Persisted | Notes |
|----------|-----------|-----------|-------|
| Webpage | - | ✅ Yes | URL, title, favicon |
| Text Note | `note` | ✅ Yes | Full note content via `metadata.noteContent` |
| LLM Response | `llm-response` | ✅ Yes | Query, response, model, token counts, context tabs |
| Upload | - | ❌ No | Binary data should be re-uploaded |
| API Key Instructions | `api-key-instructions` | ❌ No | Ephemeral help tab |
| Raw Message Viewer | - | ❌ No | Can be reopened from source LLM tab |

## Storage Mechanism

### File-Based Session Storage

Sessions are stored as JSON in the Electron user data directory:

```typescript
// Location: app.getPath('userData')/session.json
interface SessionData {
  tabs: TabData[];           // All persistable tabs
  activeTabId: string | null; // Currently active tab
  lastSaved: number;          // Timestamp
}
```

**Typical location by platform:**
- **macOS**: `~/Library/Application Support/llm-browser/session.json`
- **Windows**: `%APPDATA%/llm-browser/session.json`
- **Linux**: `~/.config/llm-browser/session.json`

### Save Triggers

Sessions are saved automatically:
- Every 30 seconds (periodic auto-save)
- On window close
- After tab creation, close, or modification
- After note content changes (debounced)
- After LLM response completes

```typescript
// Periodic save
setInterval(() => this.saveSession(), 30000);

// Save on close
this.mainWindow.on('close', () => {
  this.saveSession();
});
```

## Data Sizes

Understanding data sizes helps evaluate storage needs:

| Data Type | Typical Size | Maximum Expected |
|-----------|-------------|------------------|
| Webpage tab (metadata only) | 200-500 bytes | 1KB |
| Text note | 1-50KB | 500KB |
| LLM response (short) | 5-20KB | 50KB |
| LLM response (long with context) | 50-200KB | 1MB |
| Full session (10 tabs) | 20-100KB | 500KB |
| Heavy usage (50+ LLM responses) | 1-5MB | 20MB |

**Why JSON file storage works:**
- Typical sessions stay under 5MB
- JSON parse/stringify is fast for this size
- Human-readable for debugging
- No external dependencies

## Tab Data Structure

### LLM Response Tabs

Full conversation context is preserved:

```typescript
{
  id: "tab-42",
  title: "Response claude-3.5-sonnet up: 1,234 down: 567",
  url: "llm-response://1702000000000",
  type: "notes",
  component: "llm-response",
  created: 1702000000000,
  lastViewed: 1702000001000,
  metadata: {
    isLLMResponse: true,
    query: "What is the capital of France?",
    fullQuery: "[Context from tabs...]\n\nUser query: What is...",
    response: "The capital of France is Paris...",
    model: "claude-3.5-sonnet",
    tokensIn: 1234,
    tokensOut: 567,
    persistentId: "550e8400-e29b-41d4-a716-446655440000",
    shortId: "abc12345",
    slug: "capital-of-france",
    selectedTabIds: ["tab-1", "tab-3"],
    contextTabs: [
      { id: "tab-1", title: "Wikipedia", url: "https://...", type: "webpage" }
    ]
  }
}
```

### Text Note Tabs

Note content is stored in metadata:

```typescript
{
  id: "tab-15",
  title: "Meeting Notes",
  url: "# Meeting Notes\n\n- Point 1...",
  type: "notes",
  component: "note",
  created: 1702000000000,
  lastViewed: 1702000001000,
  metadata: {
    fileType: "text",
    noteContent: "# Meeting Notes\n\n- Point 1\n- Point 2\n..."
  }
}
```

## Restoration Logic

### Tab Type Detection

On restore, tabs are recreated based on their `component` and `type`:

```typescript
private restoreTab(tabData: TabData): string | null {
  // LLM Response tabs
  if (tabData.component === 'llm-response' && tabData.metadata?.isLLMResponse) {
    return this.restoreLLMResponseTab(tabData);
  }

  // Text note tabs
  if (tabData.component === 'note' && tabData.type === 'notes') {
    return this.restoreNoteTab(tabData);
  }

  // Regular webpage tabs
  if (tabData.type === 'webpage') {
    const { tabId } = this.openUrl(tabData.url, false);
    return tabId;
  }

  return null; // Skip unknown types
}
```

### LLM Tab Restoration

LLM response tabs are restored with full metadata but marked as not streaming:

```typescript
private restoreLLMResponseTab(tabData: TabData): string {
  const tab: TabWithView = {
    id: this.createTabId(),
    title: tabData.title,
    url: tabData.url,
    type: 'notes',
    component: 'llm-response',
    created: tabData.created || Date.now(),
    lastViewed: tabData.lastViewed || Date.now(),
    metadata: {
      isLLMResponse: true,
      query: metadata.query,
      response: metadata.response,
      model: metadata.model,
      tokensIn: metadata.tokensIn,
      tokensOut: metadata.tokensOut,
      isStreaming: false,  // Never restore as streaming
      // ... other fields
    },
  };

  this.tabs.set(tab.id, tab);
  this.sendToRenderer('tab-created', { tab: this.getTabData(tab.id) });
  return tab.id;
}
```

### Tab ID Remapping

Session tab IDs (e.g., `tab-15`) are ephemeral and change on each restart. The system:

1. Tracks the **index** of the previously active tab
2. Restores tabs in order, generating new IDs
3. Re-activates the tab at the same index position

```typescript
// Find active tab's position before restore
let activeTabIndex = session.tabs.findIndex(tab => tab.id === session.activeTabId);

// Restore tabs, tracking new IDs
const restoredTabIds: string[] = [];
for (const tabData of session.tabs) {
  const tabId = this.restoreTab(tabData);
  if (tabId) restoredTabIds.push(tabId);
}

// Reactivate by index
if (activeTabIndex >= 0 && activeTabIndex < restoredTabIds.length) {
  this.setActiveTab(restoredTabIds[activeTabIndex]);
}
```

## Exclusion Criteria

Some tab types are intentionally excluded:

### Upload Tabs

```typescript
if (tab.type === 'upload') return false;
```

**Reason**: Upload tabs contain binary data (images, PDFs) stored as base64 in memory. Persisting this would:
- Bloat the session file significantly
- Duplicate data already on disk
- Create stale references if files are moved/deleted

**User workflow**: Re-drag files into the browser on restart.

### Ephemeral Helper Tabs

```typescript
if (tab.component === 'api-key-instructions') return false;
if (tab.url?.startsWith('raw-message://')) return false;
```

**Reason**: These are temporary utility views that can be easily reopened:
- API key instructions: Available from the settings UI
- Raw message viewer: Reopened via "View Raw" on any LLM tab

## Alternative Storage Options Considered

### Why Not localStorage?

- **5-10MB limit**: Could be exceeded with heavy LLM usage
- **Renderer-only access**: Would require IPC to sync with main process
- **No file access**: Can't inspect/backup easily

### Why Not IndexedDB?

- **Complexity**: Overkill for simple key-value session data
- **Async API**: Would complicate shutdown save logic
- **Renderer-only**: Same IPC issues as localStorage

### Why Not SQLite?

- **Good for future scaling**: If implementing search, conversation history, or multi-session support
- **Current tradeoff**: JSON is simpler and sufficient for single-session use
- **Migration path**: Easy to add SQLite layer later if needed

## Future Enhancements

### Potential Improvements

1. **Compression**: gzip the session.json for 60-80% size reduction
2. **Incremental saves**: Only write changed tabs
3. **Multiple sessions**: Named session profiles
4. **Cloud sync**: Optional backup to cloud storage
5. **Session history**: Keep last N sessions for recovery

### Migration to SQLite

If data size becomes a concern:

```typescript
// Schema for future SQLite migration
CREATE TABLE tabs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  component TEXT,
  title TEXT,
  url TEXT,
  created INTEGER,
  last_viewed INTEGER
);

CREATE TABLE tab_metadata (
  tab_id TEXT PRIMARY KEY REFERENCES tabs(id),
  query TEXT,
  response TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  -- ... other fields
);

CREATE INDEX idx_tabs_type ON tabs(type);
CREATE INDEX idx_tabs_created ON tabs(created);
```

**Benefits**:
- Efficient queries (find all LLM tabs, search responses)
- Partial updates (don't rewrite entire file)
- ACID guarantees
- Better handling of large responses

---

## Related Documentation

- [Flexible Tab System](./03-flexible-tab-system.md) - Tab types and rendering
- [Store Synchronization](./07-store-synchronization-across-processes.md) - IPC state management
- [Round-Trip Test Pattern](./06-round-trip-test-pattern.md) - Testing persistence
