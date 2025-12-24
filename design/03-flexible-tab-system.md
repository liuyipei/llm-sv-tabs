# Flexible Tab System Architecture

## Overview

The tab system is designed to handle heterogeneous content types within a unified interface. Unlike traditional browsers that only handle URLs, this system supports webpages, files, text, LLM responses, and custom content types—each with appropriate rendering strategies.

**Update (multi-window):** The single-window assumptions in this document have been superseded by the new multi-window Tab Registry and Window Controller architecture described in [Design 14: Multi-Window Tab Registry](./14-multi-window-tab-registry.md). Treat this document as the content-type primer; defer to Design 14 for ownership, window routing, and lifecycle rules.

## Tab Types

### Type Taxonomy

```typescript
export type TabType = 'webpage' | 'pdf' | 'notes' | 'upload';

export interface Tab {
  id: string;              // 'tab-1', 'tab-2', etc.
  title: string;           // Display title
  url: string;             // URI (may be virtual)
  type: TabType;           // Content type
  favicon?: string;        // Icon URL or data URI
  lastViewed?: number;     // Timestamp
  created?: number;        // Timestamp
  metadata?: TabMetadata;  // Type-specific data
}
```

### URL Schemes

Different tab types use different URL schemes:

| Tab Type | URL Scheme | Example | Rendering |
|----------|------------|---------|-----------|
| Webpage | `http://`, `https://` | `https://example.com` | WebContentsView |
| PDF | `file://` | `file:///path/to/doc.pdf` | WebContentsView (PDF viewer) |
| Notes | `file://`, `note://` | `note://12345` | WebContentsView (HTML) |
| Upload | `upload://` | `upload://document-12345` | WebContentsView (converted) |
| LLM Response | `llm-response://` | `llm-response://1699123456789` | Svelte component |

## Rendering Strategies

### Hybrid Architecture

The system uses two rendering backends:

```typescript
interface TabWithView extends Tab {
  view?: WebContentsView;                // Electron native view
  component?: 'llm-response' | 'note';   // Svelte component name
}
```

**Decision Logic**:
```typescript
function createTab(type: TabType, url: string): TabWithView {
  if (type === 'notes' && url.startsWith('llm-response://')) {
    // Svelte component (no WebContentsView)
    return {
      type: 'notes',
      component: 'llm-response',
      view: undefined,
    };
  } else {
    // WebContentsView
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: PRELOAD_PATH,
      },
    });
    view.webContents.loadURL(url);

    return {
      type: type,
      view: view,
      component: undefined,
    };
  }
}
```

### Why Hybrid?

**WebContentsView Advantages**:
- Full web platform (JavaScript, CSS, Canvas, WebGL)
- Isolated process per tab
- Native scrolling and rendering
- Built-in PDF viewer
- Security isolation

**Svelte Component Advantages**:
- Direct access to IPC events (streaming)
- Shared state with UI
- Lower memory footprint
- Instant reactivity
- Custom styling

## Tab Type Details

### 1. Webpage Tabs

**Creation**:
```typescript
async openUrl(url: string): Promise<string> {
  const tab: TabWithView = {
    id: this.generateTabId(),
    title: 'Loading...',
    url: url,
    type: 'webpage',
    created: Date.now(),
    view: new WebContentsView(),
  };

  tab.view.webContents.loadURL(url);

  // Listen for page title
  tab.view.webContents.on('page-title-updated', (event, title) => {
    this.updateTabTitle(tab.id, title);
  });

  // Extract favicon
  tab.view.webContents.on('did-finish-load', () => {
    this.extractFavicon(tab);
  });

  this.tabs.set(tab.id, tab);
  return tab.id;
}
```

**Lifecycle Events**:
- `did-start-loading`: Show loading indicator
- `did-finish-load`: Extract title, favicon, metadata
- `did-fail-load`: Show error page
- `page-title-updated`: Update tab title
- `page-favicon-updated`: Update favicon

**Navigation**:
```typescript
tab.view.webContents.on('will-navigate', (event, url) => {
  // Update tab URL
  this.updateTabUrl(tab.id, url);
});

tab.view.webContents.on('did-navigate', (event, url) => {
  // Update history
  this.addToHistory(tab.id, url);
});
```

### 2. PDF Tabs

**Creation**:
```typescript
async openPdfTab(filePath: string): Promise<string> {
  const tab: TabWithView = {
    id: this.generateTabId(),
    title: path.basename(filePath),
    url: `file://${filePath}`,
    type: 'pdf',
    view: new WebContentsView(),
  };

  // Electron has built-in PDF viewer
  tab.view.webContents.loadURL(`file://${filePath}`);

  this.tabs.set(tab.id, tab);
  return tab.id;
}
```

**Features**:
- Uses Chromium's built-in PDF.js
- Supports search, zoom, page navigation
- Can extract text for LLM context

**Content Extraction**:
```typescript
async extractPdfContent(tabId: string): Promise<string> {
  const tab = this.tabs.get(tabId);
  const filePath = tab.url.replace('file://', '');

  // Use pdf-parse library
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);

  return pdfData.text;
}
```

### 3. Notes Tabs

Notes tabs handle uploaded files converted to HTML:

**Creation**:
```typescript
async openNoteTab(
  noteId: string,
  title: string,
  content: string,
  fileType: string
): Promise<string> {
  const tab: TabWithView = {
    id: this.generateTabId(),
    title: title,
    url: `note://${noteId}`,
    type: 'notes',
    view: new WebContentsView(),
  };

  // Convert content to HTML
  const html = await this.convertToHtml(content, fileType);

  // Load HTML directly
  tab.view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  this.tabs.set(tab.id, tab);
  return tab.id;
}
```

**Supported File Types**:
- `.txt`: Plain text → `<pre>` tags
- `.md`: Markdown → HTML (using `marked`)
- `.html`: Direct load
- `.json`: Syntax highlighted `<pre>`
- `.csv`: Table rendering

**Conversion Example**:
```typescript
async convertToHtml(content: string, fileType: string): Promise<string> {
  let body = '';

  switch (fileType) {
    case 'md':
      body = marked.parse(content);
      break;
    case 'txt':
      body = `<pre>${escapeHtml(content)}</pre>`;
      break;
    case 'json':
      body = `<pre class="language-json">${hljs.highlight(content, { language: 'json' }).value}</pre>`;
      break;
    case 'csv':
      body = this.csvToTable(content);
      break;
    default:
      body = `<pre>${escapeHtml(content)}</pre>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${DEFAULT_STYLES}</style>
    </head>
    <body>${body}</body>
    </html>
  `;
}
```

### 4. LLM Response Tabs

**Special Rendering**: Uses Svelte component instead of WebContentsView

**Creation**:
```typescript
async openLLMResponseTab(
  query: string,
  response?: string,
  error?: string
): Promise<string> {
  const timestamp = Date.now();

  const tab: TabWithView = {
    id: this.generateTabId(),
    title: error ? 'Error' : (response ? this.truncateTitle(query) : 'Loading...'),
    url: `llm-response://${timestamp}`,
    type: 'notes',
    component: 'llm-response',  // Key difference!
    view: undefined,            // No WebContentsView
    created: timestamp,
    metadata: {
      isLLMResponse: true,
      query: query,
      response: response,
      isStreaming: !response && !error,
      error: error,
    },
  };

  this.tabs.set(tab.id, tab);
  this.notifyRenderer('tab-created', this.getTabData(tab));

  return tab.id;
}
```

**Streaming Updates**:
```typescript
async updateLLMResponseTab(
  tabId: string,
  response?: string,
  partialMetadata?: Partial<TabMetadata>
): Promise<void> {
  const tab = this.tabs.get(tabId);

  // Merge metadata
  tab.metadata = {
    ...tab.metadata,
    ...partialMetadata,
    response: response ?? tab.metadata.response,
    isStreaming: false,
  };

  // Update title
  if (response && !tab.metadata.error) {
    tab.title = this.truncateTitle(tab.metadata.query);
  }

  // Notify renderer
  this.notifyRenderer('tab-updated', this.getTabData(tab));
}
```

**Title Truncation**:
```typescript
private truncateTitle(query: string, maxLength: number = 50): string {
  const modelName = this.extractModelName(query);
  const cleanQuery = query.replace(/^.*?\n\n/, ''); // Remove context

  let title = cleanQuery.substring(0, maxLength);
  if (cleanQuery.length > maxLength) {
    title += '...';
  }

  if (modelName) {
    title = `${modelName}: ${title}`;
  }

  return title;
}
```

## Tab Metadata System

### Metadata Interface

```typescript
export interface TabMetadata {
  // LLM Response metadata
  isLLMResponse?: boolean;
  query?: string;              // User's original query
  fullQuery?: string;          // Query + context from selected tabs
  response?: string;           // Complete response text
  tokensIn?: number;           // Input tokens
  tokensOut?: number;          // Output tokens
  model?: string;              // Model used (e.g., 'gpt-4-turbo')
  selectedTabIds?: string[];   // Tabs used for context
  isStreaming?: boolean;       // Currently streaming
  error?: string;              // Error message

  // File metadata
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: number;

  // Webpage metadata
  description?: string;
  keywords?: string[];
  author?: string;
  publishedDate?: string;

  // Custom metadata
  [key: string]: any;
}
```

### Metadata Usage Examples

**Display Token Counts**:
```svelte
{#if tab.metadata?.tokensIn}
  <span class="token-count">
    {tab.metadata.tokensIn} → {tab.metadata.tokensOut} tokens
  </span>
{/if}
```

**Show Context Sources**:
```svelte
{#if tab.metadata?.selectedTabIds}
  <div class="context-sources">
    <strong>Context from:</strong>
    {#each tab.metadata.selectedTabIds as sourceId}
      <TabChip tabId={sourceId} />
    {/each}
  </div>
{/if}
```

**Error Display**:
```svelte
{#if tab.metadata?.error}
  <div class="error-banner">
    ⚠️ {tab.metadata.error}
  </div>
{/if}
```

## Tab Data Transfer

### IPC Serialization

WebContentsViews cannot be serialized, so we use a simplified `TabData` type:

```typescript
export interface TabData {
  id: string;
  title: string;
  url: string;
  type: TabType;
  component?: 'llm-response' | 'note';
  metadata?: TabMetadata;
}
```

**Conversion**:
```typescript
private getTabData(tab: TabWithView): TabData {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    type: tab.type,
    component: tab.component,
    metadata: tab.metadata,
  };
}
```

**IPC Events**:
```typescript
// Main process
this.mainWindow.webContents.send('tab-created', tabData);
this.mainWindow.webContents.send('tab-updated', tabData);
this.mainWindow.webContents.send('tab-closed', tabId);

// Renderer process
ipcRenderer.on('tab-created', (event, tabData) => {
  tabStore.addTab(tabData);
});
```

## Tab Operations

### Create Tab

```typescript
// Main process
ipcMain.handle('open-url', async (event, url) => {
  const tabId = await tabManager.openUrl(url);
  return { success: true, tabId };
});

// Renderer process
const result = await ipc.openUrl('https://example.com');
```

### Close Tab

```typescript
async closeTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);

  // Cleanup WebContentsView
  if (tab.view) {
    if (this.activeWebContentsView === tab.view) {
      this.mainWindow.contentView.removeChildView(tab.view);
      this.activeWebContentsView = null;
    }

    // Destroy to free memory
    (tab.view.webContents as any).destroy();
  }

  // Remove from map
  this.tabs.delete(tabId);

  // Notify renderer
  this.notifyRenderer('tab-closed', tabId);

  // Switch to another tab if this was active
  if (this.activeTabId === tabId) {
    const remainingTabs = Array.from(this.tabs.keys());
    if (remainingTabs.length > 0) {
      await this.setActiveTab(remainingTabs[0]);
    }
  }
}
```

### Race Conditions in Tab Destruction

**Current State (Band-Aid Approach)**

The current implementation uses try-catch blocks to prevent crashes when operations race with tab destruction:

```typescript
setActiveTab(tabId: string): { success: boolean; error?: string } {
  // Check if destroyed
  if (tab.view.webContents.isDestroyed()) {
    return { success: false, error: 'Tab webContents has been destroyed' };
  }

  try {
    // Race window: object could be destroyed here
    tab.view.setBounds(...);
  } catch (error) {
    // Catch and suppress
    if (error.message.includes('destroyed')) {
      return { success: false, error: 'Tab webContents was destroyed' };
    }
    throw error;
  }
}
```

**Problem**: This prevents crashes but doesn't address the root cause. Operations can still execute on resources being destroyed, leading to silent failures.

**Future Improvement: Inverse Order Pattern**

Industry standard for graceful shutdown follows the "inverse order" rule:

1. **Mark as closing** - Set `state: 'closing'` to prevent new operations
2. **Stop accepting work** - Reject operations on closing tabs early
3. **Wait for pending operations** - Let in-flight async work complete
4. **Destroy resources** - Remove view, close webContents
5. **Remove from Map** - Clean up reference

```typescript
// Proposed implementation
interface TabWithView extends Tab {
  view?: WebContentsView;
  state: 'active' | 'closing' | 'destroyed';  // Add lifecycle state
}

async closeTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);

  // Step 1: Mark as closing (prevents new operations)
  tab.state = 'closing';

  // Step 2: Wait for pending operations (if tracking)
  await this.waitForPendingOperations(tabId);

  // Step 3: Destroy resources
  if (tab.view) {
    this.mainWindow.contentView.removeChildView(tab.view);
  }

  // Step 4: Mark as destroyed
  tab.state = 'destroyed';

  // Step 5: Remove from Map
  this.tabs.delete(tabId);
}

// Early rejection of operations on closing tabs
setActiveTab(tabId: string): { success: boolean; error?: string } {
  const tab = this.tabs.get(tabId);
  if (tab.state !== 'active') {
    return { success: false, error: 'Tab is closing or destroyed' };
  }
  // ... rest of operation
}
```

**Benefits**:
- Prevents operations on resources being destroyed
- No silent failures or data loss
- Proper ordering eliminates race conditions
- try-catch becomes last resort, not primary defense

**Reference**: Similar to Node.js graceful shutdown pattern (close server → wait for requests → close DB → exit).

### Switch Tab

```typescript
async setActiveTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);

  // Remove current WebContentsView
  if (this.activeWebContentsView) {
    this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
    this.activeWebContentsView = null;
  }

  // Add new WebContentsView (if applicable)
  if (tab.view) {
    this.mainWindow.contentView.addChildView(tab.view);
    tab.view.setBounds(this.calculateBounds());
    this.activeWebContentsView = tab.view;
  }

  // Update state
  this.activeTabId = tabId;
  tab.lastViewed = Date.now();

  // Notify renderer
  this.notifyRenderer('active-tab-changed', {
    tabId: tabId,
    data: this.getTabData(tab),
  });
}
```

### Duplicate Tab

```typescript
async duplicateTab(tabId: string): Promise<string> {
  const original = this.tabs.get(tabId);

  if (original.component === 'llm-response') {
    // Duplicate LLM response
    return await this.openLLMResponseTab(
      original.metadata.query,
      original.metadata.response,
      original.metadata.error
    );
  } else {
    // Duplicate webpage/note
    return await this.openUrl(original.url);
  }
}
```

## Tab Selection for Context

### Selection State

```typescript
// Renderer store
export const selectedTabs = writable<Set<string>>(new Set());

export function toggleTabSelection(tabId: string) {
  selectedTabs.update(set => {
    const newSet = new Set(set);
    if (newSet.has(tabId)) {
      newSet.delete(tabId);
    } else {
      newSet.add(tabId);
    }
    return newSet;
  });
}
```

### Visual Indicator

```svelte
<div class="tab-item" class:selected={$selectedTabs.has(tab.id)}>
  <input
    type="checkbox"
    checked={$selectedTabs.has(tab.id)}
    on:change={() => toggleTabSelection(tab.id)}
  />
  <span class="title">{tab.title}</span>
</div>
```

### Context Extraction

When a query is sent with selected tabs:

```typescript
const options: QueryOptions = {
  selectedTabIds: Array.from($selectedTabs),
  includeMedia: false,
};

// Main process extracts content
for (const tabId of options.selectedTabIds) {
  const content = await ContentExtractor.extractFromTab(tabId);
  contextParts.push(content);
}
```

## Persistence

### Session Storage

Webpages, notes, and LLM response tabs are persisted. Only uploads and ephemeral helper tabs are excluded:

```typescript
// tab-manager.ts saveSession()
const tabs = Array.from(this.tabs.values())
  .map((tab) => this.getTabData(tab.id)!)
  .filter((tab) => {
    // Exclude upload tabs (binary data)
    if (tab.type === 'upload') return false;
    // Exclude ephemeral helper tabs
    if (tab.component === 'api-key-instructions') return false;
    // Exclude raw message viewer (can be reopened from source tab)
    if (tab.url?.startsWith('raw-message://')) return false;
    return true;
  });

this.sessionManager.saveSession(tabs, this.activeTabId);
```

### Restoration

Tabs are restored based on their type and component:

```typescript
private restoreTab(tabData: TabData): string | null {
  // LLM Response tabs - restore with full metadata
  if (tabData.component === 'llm-response' && tabData.metadata?.isLLMResponse) {
    return this.restoreLLMResponseTab(tabData);
  }

  // Text note tabs - restore with content
  if (tabData.component === 'note' && tabData.type === 'notes') {
    return this.restoreNoteTab(tabData);
  }

  // Regular webpage tabs - reload from URL
  if (tabData.type === 'webpage') {
    const { tabId } = this.openUrl(tabData.url, false);
    return tabId;
  }

  return null;
}
```

**For complete persistence details, see:** [Session Persistence Design Document](./10-session-persistence.md)

## Future Extensions

### Custom Tab Types

The system can be extended with new tab types:

```typescript
// Add new type
export type TabType = 'webpage' | 'pdf' | 'notes' | 'upload' | 'terminal' | 'kanban';

// Implement rendering
if (tab.component === 'terminal') {
  return <Terminal tabId={tab.id} />;
} else if (tab.component === 'kanban') {
  return <KanbanBoard tabId={tab.id} />;
}
```

### Tab Groups

```typescript
interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
  collapsed: boolean;
}
```

### Tab Pinning

```typescript
interface Tab {
  // ...
  pinned?: boolean;
}

// Pinned tabs always stay at the top
const sortedTabs = derived(tabs, $tabs => {
  const pinned = $tabs.filter(t => t.pinned);
  const unpinned = $tabs.filter(t => !t.pinned);
  return [...pinned, ...unpinned];
});
```

### Tab Sharing

Export/import tab collections:

```typescript
async exportTabs(tabIds: string[]): Promise<string> {
  const exportData = {
    version: 1,
    timestamp: Date.now(),
    tabs: tabIds.map(id => {
      const tab = tabManager.getTab(id);
      return {
        title: tab.title,
        url: tab.url,
        type: tab.type,
      };
    }),
  };

  return JSON.stringify(exportData);
}
```

---

## Screenshot Capture Integration

The tab system includes built-in screenshot capture functionality that creates image tabs from user-selected screen regions.

**For complete implementation details, see:** [Screenshot Capture Design Document](./05-screenshot-capture.md)

### Quick Overview

- **User trigger:** Click "📸 Screenshot" button or press `Ctrl+Alt+S` / `Cmd+Alt+S`
- **Selection:** Drag-to-select overlay with real-time dimension display
- **Integration:** Screenshots automatically open as image tabs
- **Technology:** Electron's native `desktopCapturer` API (zero external dependencies)
- **Cross-platform:** Windows, macOS (with Screen Recording permission), Linux
