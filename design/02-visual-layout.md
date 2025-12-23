# Visual Layout Architecture

## Overview

The application uses a hybrid layout combining Electron's native WebContentsView for web content with Svelte components for UI controls. The layout is designed for efficient content browsing with integrated LLM interaction.

## Layout Structure

### Top-Level Division

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Window                              │
│  ┌──────────────────┬──────────────────────────────────────┐   │
│  │                  │         URL Bar (53px)               │   │
│  │                  ├──────────────────────────────────────┤   │
│  │    Sidebar       │                                      │   │
│  │    (350px)       │       Main Content Area              │   │
│  │                  │    (WebContentsView or Svelte)       │   │
│  │                  │                                      │   │
│  │                  │                                      │   │
│  └──────────────────┴──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Layout Constants

```typescript
// tab-manager.ts
const SIDEBAR_WIDTH = 350;  // Fixed width
const HEADER_HEIGHT = 53;   // URL bar height

// WebContentsView positioning
const bounds = {
  x: SIDEBAR_WIDTH,
  y: HEADER_HEIGHT,
  width: windowWidth - SIDEBAR_WIDTH,
  height: windowHeight - HEADER_HEIGHT,
};
```

## Sidebar Architecture

### Vertical Split Design

```
┌─────────────────────┐
│  Navigation Bar     │ ← Tab switcher (Chat/Settings/Bookmarks/Notes)
├─────────────────────┤
│                     │
│   Active Panel      │ ← 60% of sidebar height (configurable)
│   (Chat/Settings/   │
│    Bookmarks/Notes) │
│                     │
├─────────────────────┤ ← Resizable divider
│                     │
│   Tab List          │ ← 40% of sidebar height
│   (All open tabs)   │
│                     │
└─────────────────────┘
```

### Resizable Split Implementation

```svelte
<!-- App.svelte -->
<div class="sidebar-top" style="height: {sidebarTabsHeightPercent}%">
  {#if activePanel === 'chat'}
    <ChatPanel />
  {:else if activePanel === 'settings'}
    <SettingsPanel />
  {:else if activePanel === 'bookmarks'}
    <BookmarksPanel />
  {:else if activePanel === 'notes'}
    <NotesPanel />
  {/if}
</div>

<div class="divider" on:mousedown={handleResizeStart}></div>

<div class="sidebar-bottom" style="height: {100 - sidebarTabsHeightPercent}%">
  <TabList />
</div>
```

### Navigation Bar

Four icon-based tabs at the top:

```svelte
<nav class="sidebar-nav">
  <button class:active={activePanel === 'chat'}>💬 Chat</button>
  <button class:active={activePanel === 'settings'}>⚙️ Settings</button>
  <button class:active={activePanel === 'bookmarks'}>⭐ Bookmarks</button>
  <button class:active={activePanel === 'notes'}>📝 Notes</button>
</nav>
```

**Active State**: Highlighted with accent color and border

## Main Content Area

### URL Bar Component

Fixed at the top (53px height):

```svelte
<!-- UrlBar.svelte -->
<div class="url-bar">
  <button class="back" on:click={goBack}>←</button>
  <button class="forward" on:click={goForward}>→</button>
  <button class="refresh" on:click={reload}>↻</button>

  <input
    type="text"
    value={currentUrl}
    on:keydown={handleUrlSubmit}
    placeholder="Enter URL or search..."
  />

  <button class="bookmark" on:click={toggleBookmark}>⭐</button>
</div>
```

### Hybrid Content Rendering

The main content area switches between two rendering modes:

#### Mode 1: WebContentsView (Native Electron)

Used for:
- Webpages (HTTP/HTTPS)
- PDF files
- Uploaded notes (HTML, Markdown, TXT)

```typescript
// tab-manager.ts
const view = new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});

view.setBounds({
  x: SIDEBAR_WIDTH,
  y: HEADER_HEIGHT,
  width: windowWidth - SIDEBAR_WIDTH,
  height: windowHeight - HEADER_HEIGHT,
});

mainWindow.contentView.addChildView(view);
view.webContents.loadURL(url);
```

**Advantages**:
- Full web platform support (JavaScript, CSS, media)
- Isolated process per tab
- Native scrolling and rendering

#### Mode 2: Svelte Component

Used for:
- LLM responses with streaming
- Interactive notes

```svelte
<!-- App.svelte -->
{#if showSvelteContent && activeTab}
  {#if activeTab.component === 'llm-response'}
    <MessageStream
      tabId={activeTab.id}
      metadata={activeTab.metadata}
    />
  {:else if activeTab.component === 'note'}
    <NoteEditor
      noteId={activeTab.id}
      content={activeTab.content}
    />
  {/if}
{/if}
```

**Conditional Rendering**:
```typescript
$: showSvelteContent = activeTab && !activeTab.view;
```

### Tab Switching Logic

```typescript
setActiveTab(tabId: string) {
  const tab = this.tabs.get(tabId);

  // Remove current WebContentsView
  if (this.activeWebContentsView) {
    this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
    this.activeWebContentsView = null;
  }

  // Show new WebContentsView (if exists)
  if (tab.view) {
    this.mainWindow.contentView.addChildView(tab.view);
    tab.view.setBounds(this.calculateBounds());
    this.activeWebContentsView = tab.view;
  }

  // Notify renderer (triggers Svelte reactivity)
  this.mainWindow.webContents.send('active-tab-changed', {
    tabId: tabId,
    data: this.getTabData(tab),
  });
}
```

## Panel Layouts

### Chat Panel

```
┌────────────────────────────┐
│  Selected Tabs (chips)     │ ← Context indicator
├────────────────────────────┤
│  Query Input (textarea)    │ ← Multi-line input
├────────────────────────────┤
│  [Send] [Clear Selection]  │ ← Action buttons
├────────────────────────────┤
│  Quick Prompts             │ ← Template buttons
│  [Summarize] [Explain]...  │
└────────────────────────────┘
```

**Selected Tabs Display**:
```svelte
{#if $selectedTabs.size > 0}
  <div class="selected-tabs">
    {#each Array.from($selectedTabs) as tabId}
      <TabChip {tabId} onRemove={() => deselectTab(tabId)} />
    {/each}
  </div>
{/if}
```

### Settings Panel

```
┌────────────────────────────┐
│  Provider Selection        │
│  [OpenAI ▼]                │
├────────────────────────────┤
│  API Key                   │
│  [••••••••••] [Test]       │
├────────────────────────────┤
│  Model Selection           │
│  [gpt-4-turbo ▼]           │
├────────────────────────────┤
│  Parameters                │
│  Temperature: [0.7] ━━━○━  │
│  Max Tokens:  [2000]       │
│  System Prompt:            │
│  [────────────────────]    │
└────────────────────────────┘
```

**Grouped Configuration**:
- Provider settings (top)
- Model selection (middle)
- Generation parameters (bottom)

### Bookmarks Panel

```
┌────────────────────────────┐
│  [Search bookmarks...]     │
├────────────────────────────┤
│  📄 Title 1                │
│     https://example.com    │
├────────────────────────────┤
│  📄 Title 2                │
│     https://example.org    │
├────────────────────────────┤
│  ...                       │
└────────────────────────────┘
```

**List Items**:
- Favicon + title
- URL preview
- Click to open in new tab

### Notes Panel

```
┌────────────────────────────┐
│  [Upload File...]          │
├────────────────────────────┤
│  📝 document.txt           │
│     Uploaded 2h ago        │
├────────────────────────────┤
│  📄 report.md              │
│     Uploaded 1d ago        │
├────────────────────────────┤
│  ...                       │
└────────────────────────────┘
```

## Tab List Component

### Tab Item Design

```
┌──────────────────────────────────┐
│ [✓] 🌐 Page Title            [×] │ ← Checkbox, favicon, title, close
│     https://example.com/page     │ ← URL preview
│     🤖 GPT-4 • 150 tokens        │ ← LLM metadata (if applicable)
└──────────────────────────────────┘
```

### Sorting Options

```svelte
<div class="sort-controls">
  <button class:active={$sortMode === 'time'}>Recent</button>
  <button class:active={$sortMode === 'url'}>URL</button>
  <button class:active={$sortMode === 'title'}>Title</button>
  <button class:active={$sortMode === 'manual'}>Manual</button>
</div>
```

### Selection States

```css
.tab-item {
  /* Normal state */
  background: var(--bg-secondary);

  &.selected {
    /* Selected for context */
    background: var(--accent-bg);
    border-left: 3px solid var(--accent-color);
  }

  &.active {
    /* Currently viewing */
    background: var(--bg-active);
    font-weight: 600;
  }

  &.selected.active {
    /* Both selected and active */
    background: var(--accent-bg-active);
  }
}
```

## Responsive Behavior

### Window Resize Handling

```typescript
mainWindow.on('resize', () => {
  const [width, height] = mainWindow.getSize();

  // Update all WebContentsViews
  for (const tab of tabManager.getAllTabs()) {
    if (tab.view) {
      tab.view.setBounds({
        x: SIDEBAR_WIDTH,
        y: HEADER_HEIGHT,
        width: width - SIDEBAR_WIDTH,
        height: height - HEADER_HEIGHT,
      });
    }
  }
});
```

### Minimum Window Size

```typescript
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,   // Sidebar + minimum content width
  minHeight: 600,  // Header + minimum content height
});
```

## LLM Response Layout

### MessageStream Component

```
┌────────────────────────────────────┐
│  Query Header                      │
│  "What is machine learning?"       │
│  📋 Copy   🔄 Regenerate           │
├────────────────────────────────────┤
│  Response Content                  │
│  Machine learning is...            │
│                                    │
│  [Markdown rendered content]       │
│                                    │
│  Code blocks with syntax highlight │
│                                    │
│  [Auto-scrolling while streaming]  │
├────────────────────────────────────┤
│  Metadata Footer                   │
│  🤖 gpt-4-turbo                    │
│  📊 150 tokens in, 450 tokens out  │
│  🕒 2s                             │
└────────────────────────────────────┘
```

### Streaming Visual Feedback

```svelte
{#if isStreaming}
  <div class="streaming-indicator">
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  </div>
{/if}
```

**CSS Animation**:
```css
@keyframes pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

.dot {
  animation: pulse 1.5s infinite;

  &:nth-child(2) { animation-delay: 0.2s; }
  &:nth-child(3) { animation-delay: 0.4s; }
}
```

## Color Scheme & Theming

**Note:** This section shows **aspirational** CSS variable definitions. These variables are **not yet implemented** in the codebase—colors are currently hardcoded. For the complete design system including all actual color values used throughout the application, see **[Design System](./13-design-system.md)**.

### CSS Variables (Proposed)

```css
:root {
  /* Layout */
  --sidebar-width: 350px;
  --header-height: 53px;

  /* Colors */
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-active: #2a2d2e;
  --text-primary: #cccccc;
  --text-secondary: #888888;
  --accent-color: #007acc;
  --accent-bg: rgba(0, 122, 204, 0.1);

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;

  /* Borders */
  --border-radius: 4px;
  --border-color: #3e3e3e;
}
```

**Current State:** Some components use `var(--variable, fallback)` syntax expecting these variables, but since they're not defined in a `:root` block, the fallback values are always used. See [Design System](./13-design-system.md) for migration strategy.

### Dark Mode Only

Currently, the application uses a dark theme exclusively. Future work could add light mode support.

## Accessibility Considerations

### Keyboard Navigation

- `Ctrl+T`: New tab
- `Ctrl+W`: Close tab
- `Ctrl+Tab`: Next tab
- `Ctrl+Shift+Tab`: Previous tab
- `Ctrl+L`: Focus URL bar
- `Ctrl+Enter`: Send query

### Focus Management

```typescript
// Auto-focus query input when chat panel opens
onMount(() => {
  if (activePanel === 'chat') {
    queryInput.focus();
  }
});
```

### Screen Reader Support

```svelte
<button aria-label="Close tab" on:click={closeTab}>
  ×
</button>

<input
  type="text"
  aria-label="Enter URL or search query"
  placeholder="Enter URL or search..."
/>
```

## Performance Optimizations

### Virtual Scrolling for Tab List

When many tabs are open (>100), use virtual scrolling:

```svelte
<svelte-virtual-list items={sortedTabs} let:item>
  <TabItem tab={item} />
</svelte-virtual-list>
```

### WebContentsView Pooling

Instead of destroying inactive WebContentsViews, hide them:

```typescript
// Future optimization
setActiveTab(tabId) {
  // Hide all views
  for (const tab of this.tabs.values()) {
    if (tab.view) {
      tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  // Show active view
  if (activeTab.view) {
    activeTab.view.setBounds(this.calculateBounds());
  }
}
```

This avoids the cost of reloading pages when switching tabs.

## Future Enhancements

1. **Adjustable Sidebar Width**: Draggable sidebar resize
2. **Multi-Window Support**: Detach tabs into separate windows
3. **Picture-in-Picture**: Float LLM responses over other apps
4. **Compact Mode**: Collapsible sidebar for more content space
5. **Custom Layouts**: Save/restore panel arrangements
