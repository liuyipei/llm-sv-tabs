# Flexible Tab System Architecture

## Overview

The tab system is designed to handle heterogeneous content types within a unified interface. Unlike traditional browsers that only handle URLs, this system supports webpages, files, text, LLM responses, and custom content types—each with appropriate rendering strategies.

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
| Webpage | `http://`, `https://` | `https://example.com` | BrowserView |
| PDF | `file://` | `file:///path/to/doc.pdf` | BrowserView (PDF viewer) |
| Notes | `file://`, `note://` | `note://12345` | BrowserView (HTML) |
| Upload | `upload://` | `upload://document-12345` | BrowserView (converted) |
| LLM Response | `llm-response://` | `llm-response://1699123456789` | Svelte component |

## Rendering Strategies

### Hybrid Architecture

The system uses two rendering backends:

```typescript
interface TabWithView extends Tab {
  view?: BrowserView;                    // Electron native view
  component?: 'llm-response' | 'note';   // Svelte component name
}
```

**Decision Logic**:
```typescript
function createTab(type: TabType, url: string): TabWithView {
  if (type === 'notes' && url.startsWith('llm-response://')) {
    // Svelte component (no BrowserView)
    return {
      type: 'notes',
      component: 'llm-response',
      view: undefined,
    };
  } else {
    // BrowserView
    const view = new BrowserView({
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

**BrowserView Advantages**:
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
    view: new BrowserView(),
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
    view: new BrowserView(),
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
    view: new BrowserView(),
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

**Special Rendering**: Uses Svelte component instead of BrowserView

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
    view: undefined,            // No BrowserView
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

BrowserViews cannot be serialized, so we use a simplified `TabData` type:

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

  // Cleanup BrowserView
  if (tab.view) {
    if (this.activeBrowserView === tab.view) {
      this.mainWindow.removeBrowserView(tab.view);
      this.activeBrowserView = null;
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

### Switch Tab

```typescript
async setActiveTab(tabId: string): Promise<void> {
  const tab = this.tabs.get(tabId);

  // Remove current BrowserView
  if (this.activeBrowserView) {
    this.mainWindow.removeBrowserView(this.activeBrowserView);
    this.activeBrowserView = null;
  }

  // Add new BrowserView (if applicable)
  if (tab.view) {
    this.mainWindow.addBrowserView(tab.view);
    tab.view.setBounds(this.calculateBounds());
    this.activeBrowserView = tab.view;
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

Only webpage tabs are persisted (notes/uploads are ephemeral):

```typescript
// session-manager.ts
async saveSession(): Promise<void> {
  const webpageTabs = Array.from(tabManager.getAllTabs())
    .filter(tab => tab.type === 'webpage')
    .map(tab => ({
      title: tab.title,
      url: tab.url,
      favicon: tab.favicon,
    }));

  const session = {
    tabs: webpageTabs,
    activeTabIndex: webpageTabs.findIndex(t => t.url === activeTab.url),
  };

  await fs.writeFile(
    path.join(app.getPath('userData'), 'session.json'),
    JSON.stringify(session, null, 2)
  );
}
```

### Restoration

```typescript
async restoreSession(): Promise<void> {
  const sessionPath = path.join(app.getPath('userData'), 'session.json');

  if (fs.existsSync(sessionPath)) {
    const session = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

    for (const tab of session.tabs) {
      await tabManager.openUrl(tab.url);
    }

    if (session.activeTabIndex >= 0) {
      const tabs = tabManager.getAllTabs();
      await tabManager.setActiveTab(tabs[session.activeTabIndex].id);
    }
  }
}
```

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

### Overview

The tab system includes built-in screenshot capture functionality that creates image tabs from user-selected screen regions. This feature uses Electron's native `desktopCapturer` API without external dependencies.

### Architecture

**Components:**
- `ScreenshotService` - Main process service handling capture workflow
- Screenshot overlay window - Frameless window for region selection
- Tab system integration - Screenshots open as image tabs

### Implementation

#### Screenshot Service

**File:** `src/main/services/screenshot-service.ts`

```typescript
export class ScreenshotService {
  private overlayWindow: BrowserWindow | null = null;
  private capturedScreenImage: nativeImage | null = null;

  async startCapture(): Promise<string | null> {
    // 1. Capture desktop using desktopCapturer
    await this.captureDesktop();

    // 2. Show overlay for region selection
    this.createOverlayWindow();

    // 3. Wait for user selection
    return new Promise((resolve) => {
      this.resolveCapture = resolve;
    });
  }

  private async captureDesktop(): Promise<void> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: displayWidth, height: displayHeight }
    });
    this.capturedScreenImage = sources[0].thumbnail;
  }

  private handleRegionSelected(bounds: Rectangle): void {
    // Adjust for HiDPI displays
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const scaledBounds = {
      x: bounds.x * scaleFactor,
      y: bounds.y * scaleFactor,
      width: bounds.width * scaleFactor,
      height: bounds.height * scaleFactor
    };

    // Crop and convert to data URL
    const cropped = this.capturedScreenImage.crop(scaledBounds);
    const dataUrl = cropped.toDataURL();

    this.cleanup();
    this.resolveCapture(dataUrl);
  }
}
```

#### User Interaction Flow

1. **Trigger:** User clicks "📸 Screenshot" button or presses `Ctrl+Alt+S` (macOS: `Cmd+Alt+S`)
2. **Capture:** Desktop is captured via `desktopCapturer.getSources()`
3. **Overlay:** Frameless, transparent overlay window appears
4. **Selection:** User drags to select region (dimensions shown in real-time)
5. **Completion:** Selected region is cropped and opened as new image tab
6. **Cancel:** ESC key closes overlay without action

#### Overlay Window

**File:** `src/main/services/screenshot-overlay.html`

Features:
- HTML5 Canvas for drawing selection rectangle
- Real-time dimension display (`width × height`)
- Visual feedback with blue highlight
- ESC key cancellation
- Minimum region size (10×10 pixels)

```javascript
canvas.addEventListener('mouseup', (e) => {
  const bounds = {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY)
  };

  if (bounds.width >= 10 && bounds.height >= 10) {
    ipcRenderer.send('screenshot-region-selected', bounds);
  }
});
```

#### Tab Creation

Screenshots automatically create new image tabs:

```typescript
// In main.ts IPC handler
ipcMain.handle('trigger-screenshot', async () => {
  const dataUrl = await screenshotService.startCapture();

  if (dataUrl) {
    const title = `Screenshot ${timestamp}`;
    tabManager.openNoteTab(noteId, title, dataUrl, 'image', true);
  }
});
```

**Tab properties:**
- Type: `'notes'`
- FileType: `'image'`
- Title: `"Screenshot YYYY-MM-DD HH:MM:SS"`
- Content: Base64 PNG data URL
- Auto-selected: Yes (immediately visible)

### Global Shortcuts

**Registration** (in `main.ts`):
```typescript
function setupGlobalShortcuts(): void {
  const shortcut = process.platform === 'darwin'
    ? 'CommandOrControl+Alt+S'
    : 'Ctrl+Alt+S';

  globalShortcut.register(shortcut, async () => {
    const dataUrl = await screenshotService.startCapture();
    if (dataUrl) {
      tabManager.openNoteTab(Date.now(), `Screenshot ${timestamp}`, dataUrl, 'image');
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupGlobalShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

### Cross-Platform Support

**Windows/Linux:**
- Shortcut: `Ctrl+Alt+S`
- Display scaling: Automatically handled via `scaleFactor`
- Permissions: No special permissions required

**macOS:**
- Shortcut: `Cmd+Alt+S`
- Display scaling: Retina displays automatically handled
- Permissions: Requires Screen Recording permission (System Preferences → Security & Privacy)

**Permission Handling:**
```typescript
try {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  if (sources.length === 0) {
    dialog.showErrorBox(
      'Permission Required',
      'Screen capture requires permission. On macOS, enable Screen Recording in System Preferences.'
    );
  }
} catch (error) {
  // Handle permission errors
}
```

### Multi-Monitor Support

Current implementation captures the primary display. For multi-monitor setups:

```typescript
// Determine which display contains selection
const displays = screen.getAllDisplays();
const targetDisplay = displays.find(display => {
  const { x, y, width, height } = display.bounds;
  return (
    bounds.x >= x && bounds.x < x + width &&
    bounds.y >= y && bounds.y < y + height
  );
});

// Adjust coordinates relative to display
const relativeX = bounds.x - targetDisplay.bounds.x;
const relativeY = bounds.y - targetDisplay.bounds.y;
```

### High-DPI Handling

Automatically adjusts for HiDPI/Retina displays:

```typescript
const display = screen.getPrimaryDisplay();
const scaleFactor = display.scaleFactor; // 1.0, 1.5, 2.0, etc.

// Scale bounds before cropping
const scaledBounds = {
  x: bounds.x * scaleFactor,
  y: bounds.y * scaleFactor,
  width: bounds.width * scaleFactor,
  height: bounds.height * scaleFactor
};

const croppedImage = sourceImage.crop(scaledBounds);
```

### UI Integration

**NotesSection Component:**

```svelte
<button
  onclick={handleScreenshotClick}
  class="action-btn screenshot-btn"
  title="Capture screen region (Ctrl+Alt+S)"
>
  📸 Screenshot
</button>

<script>
async function handleScreenshotClick() {
  const result = await ipc.triggerScreenshot();
  if (!result.success) {
    console.error('Screenshot failed:', result.error);
  }
}
</script>
```

### Technical Specifications

**Image Format:**
- Format: PNG
- Encoding: Base64 data URL
- Color depth: 32-bit RGBA
- Compression: Default PNG compression

**Performance:**
- Desktop capture: 100-300ms
- Overlay creation: ~50ms
- Image crop & encode: 20-50ms
- **Total latency:** < 500ms

**Memory Usage:**
- 4K display capture: ~25MB (temporary)
- Immediate cleanup after cropping
- No persistent storage (image stored in tab metadata)

### Use Cases

1. **Visual bug reports:** Capture UI issues for LLM analysis
2. **Design reference:** Screenshot designs for comparison
3. **Documentation:** Capture UI states for notes
4. **Code snippets:** Screenshot code from other applications
5. **Research:** Capture content for multimodal LLM queries

### Benefits Over External Tools

- **Integrated workflow:** Screenshots go directly into tabs
- **LLM ready:** Automatically formatted for vision model queries
- **No context switching:** Stay in the application
- **Cross-platform:** Works identically on Windows, macOS, Linux
- **Zero dependencies:** Uses only Electron built-in APIs

### Future Enhancements

**Potential additions:**
1. **Annotation tools:** Draw arrows, text, highlights on screenshots
2. **Delay timer:** "Capture in 3 seconds" for menu screenshots
3. **Window capture:** Capture specific application windows
4. **Scrolling capture:** Full-page captures of web content
5. **OCR integration:** Extract text from screenshots for searching
6. **Video recording:** Capture screen regions as video clips

### Code Organization

```
src/main/services/
├── screenshot-service.ts      # Core screenshot service
├── screenshot-overlay.html    # Region selection UI
├── content-extractor.ts       # Existing (image extraction for LLM)
└── image-resizer.ts           # Existing (resize for LLM queries)

src/main/
├── main.ts                    # Global shortcut registration
└── preload.ts                 # IPC bridge for screenshot

src/ui/components/notes/
└── NotesSection.svelte        # Screenshot button UI

src/types.ts                   # Rectangle interface
```

### Type Definitions

```typescript
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

This screenshot integration demonstrates how the flexible tab system can accommodate diverse content types—from web pages to user-captured images—all within a unified tab interface.
