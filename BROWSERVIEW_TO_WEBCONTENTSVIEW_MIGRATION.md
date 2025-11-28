# BrowserView to WebContentsView Migration Guide

## Executive Summary

This document outlines the migration from Electron's deprecated `BrowserView` API to the modern `WebContentsView` API. While `BrowserView` continues to work in current Electron versions, it is deprecated and will eventually be removed.

**Migration Scope:**
- 3 direct `BrowserView` instantiations (openUrl, openNoteTab, raw message viewer)
- ~26 references to `BrowserView` type annotations across the codebase (excluding docs)
- Affects: TabManager, ContentExtractor, and test mocks

**Estimated Effort:** 4-6 hours (0.5-0.75 days)

**Risk Level:** Low-Medium
- API is very similar with straightforward replacements
- Window/view attachment model changed (main incompatibility)
- Hybrid architecture already in place (some tabs use Svelte components, not views)
- Requires careful testing of tab switching, context menus, and screenshot capture

---

## Why Migrate?

### 1. Deprecation Timeline

`BrowserView` was deprecated in Electron 30 (May 2024) in favor of `WebContentsView`. The Electron team states:

> "BrowserView is deprecated and will be removed. Use WebContentsView instead."

While deprecation doesn't mean immediate removal, Electron typically removes deprecated APIs within 2-3 major versions.

### 2. Improved API Design

`WebContentsView` offers several improvements:

**Better Layout Control:**
- `WebContentsView` uses a more flexible view hierarchy
- Supports `BaseWindow.contentView.addChildView()` for nested layouts
- Better integration with Electron's view system

**Cleaner Lifecycle:**
- More predictable view attachment/detachment
- Better memory management
- Consistent behavior across platforms

**Modern Architecture:**
- Built on Electron's new view system
- Better integration with Chrome's compositor
- Foundation for future Electron features

### 3. Architecture Context

This codebase uses a **hybrid rendering architecture**:
- Web content (pages, PDFs, notes) use `BrowserView` → migrating to `WebContentsView`
- LLM responses use Svelte components (no view needed)
- API key instructions use Svelte components (no view needed)

For detailed architecture explanation, see:
- [Visual Layout Architecture](./design/02-visual-layout.md) - Layout system and view management
- [Flexible Tab System](./design/03-flexible-tab-system.md) - Hybrid rendering strategy

**Current Pain Point:** Manual bounds management on every window resize. `WebContentsView` offers `setAutoResize()` for declarative layout management.

---

## API Comparison

### Key Differences

| Aspect | BrowserView | WebContentsView |
|--------|-------------|-----------------|
| **Instantiation** | `new BrowserView({ webPreferences })` | `new WebContentsView({ webPreferences })` |
| **Attachment** | `win.addBrowserView(view)` | `win.contentView.addChildView(view)` |
| **Detachment** | `win.removeBrowserView(view)` | `win.contentView.removeChildView(view)` |
| **Positioning** | `view.setBounds({ x, y, width, height })` | `view.setBounds({ x, y, width, height })` (same) |
| **WebContents** | `view.webContents` | `view.webContents` (same) |
| **Destruction** | `view.webContents.destroy()` | `view.webContents.destroy()` (same) |
| **Auto-resize** | Manual bounds updates on resize | Auto-resize via `setAutoResize()` |

### Side-by-Side Code Examples

#### Creating a View

**Before (BrowserView):**
```typescript
import { BrowserView } from 'electron';

const view = new BrowserView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

**After (WebContentsView):**
```typescript
import { WebContentsView } from 'electron';

const view = new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

#### Attaching to Window

**Before (BrowserView):**
```typescript
mainWindow.addBrowserView(view);
view.setBounds({
  x: SIDEBAR_WIDTH,
  y: HEADER_HEIGHT,
  width: contentWidth - SIDEBAR_WIDTH,
  height: contentHeight - HEADER_HEIGHT,
});
```

**After (WebContentsView):**
```typescript
mainWindow.contentView.addChildView(view);
view.setBounds({
  x: SIDEBAR_WIDTH,
  y: HEADER_HEIGHT,
  width: contentWidth - SIDEBAR_WIDTH,
  height: contentHeight - HEADER_HEIGHT,
});

// Optional: Enable auto-resize
view.setAutoResize({
  width: true,
  height: true,
  horizontal: true,
  vertical: true,
});
```

#### Detaching from Window

**Before (BrowserView):**
```typescript
mainWindow.removeBrowserView(view);
```

**After (WebContentsView):**
```typescript
mainWindow.contentView.removeChildView(view);
```

---

## Migration Strategy

### Phase 1: Type Definitions (1 hour)

**File:** `src/types.ts`

No changes needed - `WebContentsView` is compatible with our existing type system.

**File:** `src/main/tab-manager.ts`

Update imports and type declarations:

```typescript
// Before
import { BrowserView, BrowserWindow, Menu, MenuItem } from 'electron';

interface TabWithView extends Tab {
  view?: BrowserView;
  component?: 'llm-response' | 'note' | 'api-key-instructions';
}

private activeBrowserView: BrowserView | null;

// After
import { WebContentsView, BrowserWindow, Menu, MenuItem } from 'electron';

interface TabWithView extends Tab {
  view?: WebContentsView;  // Changed
  component?: 'llm-response' | 'note' | 'api-key-instructions';
}

private activeWebContentsView: WebContentsView | null;  // Renamed for clarity
```

---

### Phase 2: TabManager Core Methods (2-3 hours)

**File:** `src/main/tab-manager.ts`

**See:** [Flexible Tab System](./design/03-flexible-tab-system.md) for complete tab lifecycle examples.

Only 3 methods create `BrowserView` instances that need migration:
- `openUrl()` - line 128 (webpages)
- `openNoteTab()` - line 194 (notes, PDFs, images)
- Raw message viewer - line 388 (LLM response debugging)

#### 2.1 Constructor

```typescript
// Before
constructor(mainWindow: BrowserWindow) {
  this.mainWindow = mainWindow;
  this.tabs = new Map();
  this.activeTabId = null;
  this.activeBrowserView = null;
  this.tabCounter = 0;
  this.sessionManager = new SessionManager();

  // Handle window resize to update BrowserView bounds
  this.mainWindow.on('resize', () => this.updateBrowserViewBounds());

  // ...
}

// After
constructor(mainWindow: BrowserWindow) {
  this.mainWindow = mainWindow;
  this.tabs = new Map();
  this.activeTabId = null;
  this.activeWebContentsView = null;  // Renamed
  this.tabCounter = 0;
  this.sessionManager = new SessionManager();

  // Window resize handler can potentially be simplified with setAutoResize
  // Keep for now for backward compatibility, can optimize later
  this.mainWindow.on('resize', () => this.updateWebContentsViewBounds());

  // ...
}
```

#### 2.2 View Creation (openUrl, openNote, etc.)

**Before:**
```typescript
openUrl(url: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
  const tabId = this.createTabId();

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const tab: TabWithView = {
    id: tabId,
    title: 'Loading...',
    url: url,
    type: 'webpage' as TabType,
    view: view,
    created: Date.now(),
    lastViewed: Date.now(),
  };

  this.tabs.set(tabId, tab);
  view.webContents.loadURL(url);

  // Set up context menu and window open handler
  this.setupContextMenu(view, tabId);
  this.setupWindowOpenHandler(view);

  // ...
}
```

**After:**
```typescript
openUrl(url: string, autoSelect: boolean = true): { tabId: string; tab: TabData } {
  const tabId = this.createTabId();

  const view = new WebContentsView({  // Changed
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const tab: TabWithView = {
    id: tabId,
    title: 'Loading...',
    url: url,
    type: 'webpage' as TabType,
    view: view,
    created: Date.now(),
    lastViewed: Date.now(),
  };

  this.tabs.set(tabId, tab);
  view.webContents.loadURL(url);

  // Set up context menu and window open handler (no changes needed)
  this.setupContextMenu(view, tabId);
  this.setupWindowOpenHandler(view);

  // ...
}
```

**Apply the same change to:**
- `openNoteTab()` - line ~191 (notes, PDFs, images)
- Raw message viewer creation - line ~385 (for viewing raw LLM responses)

#### 2.3 Context Menu Setup

**No changes needed!** The `webContents` API is identical:

```typescript
private setupContextMenu(view: WebContentsView, _tabId: string): void {
  view.webContents.on('context-menu', (_event, params) => {
    // ... menu creation (unchanged)
  });
}

private setupWindowOpenHandler(view: WebContentsView): void {
  view.webContents.setWindowOpenHandler((details) => {
    // ... handler logic (unchanged)
  });
}
```

Just update the type signature from `BrowserView` to `WebContentsView`.

#### 2.4 Bounds Management

**Before:**
```typescript
private updateBrowserViewBounds(): void {
  if (!this.activeTabId) return;

  const tab = this.tabs.get(this.activeTabId);
  if (!tab || !tab.view) return;

  const bounds = this.mainWindow.getContentBounds();
  tab.view.setBounds({
    x: this.SIDEBAR_WIDTH,
    y: this.HEADER_HEIGHT,
    width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
    height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
  });
}
```

**After (Option 1: Minimal change):**
```typescript
private updateWebContentsViewBounds(): void {  // Renamed
  if (!this.activeTabId) return;

  const tab = this.tabs.get(this.activeTabId);
  if (!tab || !tab.view) return;

  const bounds = this.mainWindow.getContentBounds();
  tab.view.setBounds({
    x: this.SIDEBAR_WIDTH,
    y: this.HEADER_HEIGHT,
    width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
    height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
  });
}
```

**After (Option 2: Use setAutoResize - Future Enhancement):**
```typescript
// When creating the view, enable auto-resize:
const view = new WebContentsView({ /* ... */ });
view.setBounds({ x: SIDEBAR_WIDTH, y: HEADER_HEIGHT, width: w, height: h });

// Enable auto-resize (eliminates need for resize handler)
view.setAutoResize({
  width: true,
  height: true,
});

// This allows removing the resize listener entirely!
```

**Recommendation:** Start with Option 1 (minimal change), then explore Option 2 as an optimization in a follow-up PR.

#### 2.5 Tab Switching (setActiveTab)

**Before:**
```typescript
setActiveTab(tabId: string): { success: boolean; error?: string } {
  const tab = this.tabs.get(tabId);
  if (!tab) return { success: false, error: 'Tab not found' };

  // Hide current active tab
  if (this.activeTabId && this.activeTabId !== tabId) {
    const currentTab = this.tabs.get(this.activeTabId);
    if (currentTab && currentTab.view) {
      this.mainWindow.removeBrowserView(currentTab.view);  // OLD API
    }
  }

  this.activeTabId = tabId;

  // Show new active tab (if it has a view)
  if (tab.view) {
    this.mainWindow.addBrowserView(tab.view);  // OLD API
    this.updateBrowserViewBounds();
    this.activeBrowserView = tab.view;
  } else {
    // Svelte component tab (no view)
    this.activeBrowserView = null;
  }

  // ...
}
```

**After:**
```typescript
setActiveTab(tabId: string): { success: boolean; error?: string } {
  const tab = this.tabs.get(tabId);
  if (!tab) return { success: false, error: 'Tab not found' };

  // Hide current active tab
  if (this.activeTabId && this.activeTabId !== tabId) {
    const currentTab = this.tabs.get(this.activeTabId);
    if (currentTab && currentTab.view) {
      this.mainWindow.contentView.removeChildView(currentTab.view);  // NEW API
    }
  }

  this.activeTabId = tabId;

  // Show new active tab (if it has a view)
  if (tab.view) {
    this.mainWindow.contentView.addChildView(tab.view);  // NEW API
    this.updateWebContentsViewBounds();
    this.activeWebContentsView = tab.view;
  } else {
    // Svelte component tab (no view)
    this.activeWebContentsView = null;
  }

  // ...
}
```

#### 2.6 Tab Closing (closeTab)

**Before:**
```typescript
closeTab(tabId: string): { success: boolean; error?: string } {
  const tab = this.tabs.get(tabId);
  if (!tab) return { success: false, error: 'Tab not found' };

  // Destroy the view
  if (tab.view) {
    this.mainWindow.removeBrowserView(tab.view);  // OLD API
    tab.view.webContents.destroy();
  }

  // ... rest of cleanup
}
```

**After:**
```typescript
closeTab(tabId: string): { success: boolean; error?: string } {
  const tab = this.tabs.get(tabId);
  if (!tab) return { success: false, error: 'Tab not found' };

  // Destroy the view
  if (tab.view) {
    this.mainWindow.contentView.removeChildView(tab.view);  // NEW API
    tab.view.webContents.destroy();
  }

  // ... rest of cleanup
}
```

---

### Phase 3: ContentExtractor Service (1 hour)

**File:** `src/main/services/content-extractor.ts`

Update type signature only:

```typescript
// Before
import { BrowserView } from 'electron';

export class ContentExtractor {
  static async extractFromTab(
    view: BrowserView,  // OLD TYPE
    tabId: string,
    includeMedia: boolean = false
  ): Promise<ExtractedContent> {
    // Implementation unchanged - uses view.webContents which is the same
  }
}

// After
import { WebContentsView } from 'electron';

export class ContentExtractor {
  static async extractFromTab(
    view: WebContentsView,  // NEW TYPE
    tabId: string,
    includeMedia: boolean = false
  ): Promise<ExtractedContent> {
    // Implementation unchanged - uses view.webContents which is the same
  }
}
```

---

### Phase 4: Test Mocks (1-2 hours)

**File:** `tests/main/tab-manager.test.js`

Update mocks to simulate `WebContentsView` API:

**Before:**
```javascript
// Mock Electron
vi.mock('electron', () => ({
  BrowserView: vi.fn(() => ({
    webContents: {
      loadURL: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
      // ...
    },
    setBounds: vi.fn(),
  })),
  // ...
}));
```

**After:**
```javascript
// Mock Electron
vi.mock('electron', () => ({
  WebContentsView: vi.fn(() => ({  // Changed
    webContents: {
      loadURL: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
      // ...
    },
    setBounds: vi.fn(),
    setAutoResize: vi.fn(),  // New method (optional)
  })),
  BrowserWindow: vi.fn(() => ({
    // ... existing mocks ...
    contentView: {  // NEW: Mock the contentView
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    // Deprecated methods can be kept for transition period
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
  })),
  // ...
}));
```

**Test assertions to update:**
```javascript
// Before
expect(mainWindow.addBrowserView).toHaveBeenCalledWith(expect.any(Object));
expect(mainWindow.removeBrowserView).toHaveBeenCalledWith(expect.any(Object));

// After
expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(expect.any(Object));
expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(expect.any(Object));
```

---

### Phase 5: Documentation Updates (1 hour)

Update all references in documentation:

**Files to update:**
- `README.md` - Change feature description from "BrowserView" to "WebContentsView"
- `design/02-visual-layout.md` - Update architecture diagrams
- `design/03-flexible-tab-system.md` - Update rendering strategy code examples
- `STREAMING_MIGRATION.md` - Update hybrid architecture section

**Search and replace:**
```bash
# Find all references
grep -r "BrowserView" design/ README.md STREAMING_MIGRATION.md

# Update terminology (manual review recommended)
# BrowserView → WebContentsView
# addBrowserView → contentView.addChildView
# removeBrowserView → contentView.removeChildView
```

---

## Migration Checklist

### Pre-Migration

- [ ] Review Electron version (ensure >= 30.0.0)
- [ ] Create feature branch: `git checkout -b migrate-to-webcontentsview`
- [ ] Run all tests to establish baseline: `npm test`
- [ ] Document current behavior with manual testing

### Migration Steps

**Phase 1: Type Updates**
- [ ] Update imports in `src/main/tab-manager.ts`
- [ ] Update interface `TabWithView`
- [ ] Rename `activeBrowserView` → `activeWebContentsView`

**Phase 2: TabManager Implementation**
- [ ] Update `openUrl()` to use `new WebContentsView()`
- [ ] Update `openNote()` to use `new WebContentsView()`
- [ ] Update `setupContextMenu()` type signature
- [ ] Update `setupWindowOpenHandler()` type signature
- [ ] Rename `updateBrowserViewBounds()` → `updateWebContentsViewBounds()`
- [ ] Update `setActiveTab()` to use `contentView.addChildView/removeChildView`
- [ ] Update `closeTab()` to use `contentView.removeChildView`
- [ ] Update resize handler to call renamed method

**Phase 3: Services**
- [ ] Update `ContentExtractor.extractFromTab()` type signature

**Phase 4: Tests**
- [ ] Update `tests/main/tab-manager.test.js` mock for `WebContentsView`
- [ ] Add `contentView` mock to `BrowserWindow`
- [ ] Update test assertions for `addChildView/removeChildView`
- [ ] Run tests: `npm test`
- [ ] Fix any failures

**Phase 5: Documentation**
- [ ] Update `README.md`
- [ ] Update `design/02-visual-layout.md`
- [ ] Update `design/03-flexible-tab-system.md`
- [ ] Update `STREAMING_MIGRATION.md`

### Post-Migration

- [ ] Run full test suite: `npm test`
- [ ] Manual testing checklist:
  - [ ] Create new tab via URL input
  - [ ] Switch between tabs
  - [ ] Close tabs
  - [ ] Context menu (reload, copy URL)
  - [ ] Right-click links (open in new tab)
  - [ ] Screenshot capture
  - [ ] LLM query with tab content
  - [ ] Create note/upload tabs
  - [ ] Window resize (verify view bounds update)
  - [ ] Session persistence (restart app)
- [ ] Performance check (tab switching latency)
- [ ] Memory check (no view leaks on tab close)
- [ ] Commit changes with descriptive message
- [ ] Create PR with migration summary

---

## Common Pitfalls & Gotchas

### 1. Window Attachment Model

**Issue:** Forgetting to use `contentView` intermediary

```typescript
// ❌ WRONG (deprecated)
mainWindow.addBrowserView(view);

// ✅ CORRECT (new API)
mainWindow.contentView.addChildView(view);
```

**Why it matters:** The old API may work initially (backward compatibility) but will fail when deprecated methods are removed.

### 2. View Hierarchy

**Issue:** Not understanding the view tree structure

`WebContentsView` is part of a view hierarchy:
```
BrowserWindow
  └─ contentView (BaseWindow.contentView)
      ├─ WebContentsView (your tab 1)
      ├─ WebContentsView (your tab 2)
      └─ WebContentsView (your tab 3)
```

Only ONE view should be visible at a time (in our tab model), achieved by adding/removing child views.

### 3. Bounds Management

**Issue:** Forgetting to call `setBounds()` after `addChildView()`

```typescript
// ❌ WRONG (view will be 0x0 pixels)
mainWindow.contentView.addChildView(view);

// ✅ CORRECT
mainWindow.contentView.addChildView(view);
view.setBounds({ x, y, width, height });
```

### 4. Multiple Views Visible

**Issue:** Adding new view without removing old one

```typescript
// ❌ WRONG (both views will be visible, overlapping)
mainWindow.contentView.addChildView(newView);

// ✅ CORRECT (remove old view first)
if (currentView) {
  mainWindow.contentView.removeChildView(currentView);
}
mainWindow.contentView.addChildView(newView);
```

### 5. WebContents Lifecycle

**Issue:** Forgetting that `webContents` is still the same

```typescript
// ✅ GOOD NEWS: This doesn't change!
view.webContents.loadURL(url);
view.webContents.on('page-title-updated', handler);
view.webContents.destroy();
```

The `webContents` API is identical between `BrowserView` and `WebContentsView`.

### 6. TypeScript Type Guards

**Issue:** Type assertions may need updating

```typescript
// Before
if (tab.view && tab.view instanceof BrowserView) {
  // ...
}

// After
if (tab.view && tab.view instanceof WebContentsView) {
  // ...
}
```

But better: Just check for presence
```typescript
if (tab.view) {
  // Duck typing - if it has webContents, it works
}
```

### 7. Auto-Resize Confusion

**Issue:** Setting auto-resize but still manually updating bounds

```typescript
// ❌ REDUNDANT (pick one approach)
view.setAutoResize({ width: true, height: true });
window.on('resize', () => view.setBounds({ ... }));

// ✅ OPTION 1: Manual bounds (current approach)
window.on('resize', () => view.setBounds({ ... }));

// ✅ OPTION 2: Auto-resize (future optimization)
view.setAutoResize({ width: true, height: true });
// Remove resize handler entirely!
```

---

## Testing Strategy

### Unit Tests

**File:** `tests/main/tab-manager.test.js`

Focus on:
1. View creation returns `WebContentsView` instance
2. View attachment uses `contentView.addChildView`
3. View detachment uses `contentView.removeChildView`
4. Tab switching properly swaps views
5. Tab closing destroys webContents

Example test:
```javascript
test('should attach WebContentsView when setting active tab', () => {
  const { tabId } = tabManager.openUrl('https://example.com');

  expect(mockBrowserWindow.contentView.addChildView).toHaveBeenCalled();

  const addedView = mockBrowserWindow.contentView.addChildView.mock.calls[0][0];
  expect(addedView.webContents).toBeDefined();
});
```

### Integration Tests

**Manual testing checklist:**

1. **Tab Lifecycle**
   - [ ] Create 5 tabs via URL input
   - [ ] Switch between them rapidly
   - [ ] Close tabs in random order
   - [ ] Verify no memory leaks (use Chrome DevTools Memory profiler)

2. **Context Menu**
   - [ ] Right-click link → Open in new tab
   - [ ] Right-click link → Save link as
   - [ ] Right-click link → Inspect element
   - [ ] Verify new tab appears correctly

3. **Window Operations**
   - [ ] Resize window (drag from corner)
   - [ ] Maximize window
   - [ ] Restore window
   - [ ] Verify view bounds update correctly (content not clipped)

4. **Content Extraction**
   - [ ] Select multiple tabs
   - [ ] Send LLM query
   - [ ] Verify extracted content includes all selected tabs

5. **Screenshot Capture**
   - [ ] Trigger screenshot (Ctrl+Alt+S)
   - [ ] Select region
   - [ ] Verify image tab created
   - [ ] Verify image renders correctly

6. **Session Persistence**
   - [ ] Create 3 tabs
   - [ ] Close app
   - [ ] Reopen app
   - [ ] Verify tabs restored (URLs correct, content loads)

### Performance Tests

**Before/After Comparison:**

1. **Tab Switching Latency**
   - Measure time from `setActiveTab()` call to view visible
   - Should be < 50ms
   - Use: `console.time('tab-switch')`

2. **Memory Usage**
   - Open 20 tabs
   - Close 15 tabs
   - Check memory (should release ~75% of tab memory)
   - Use: Chrome DevTools → Memory → Take Heap Snapshot

3. **Window Resize Performance**
   - Resize window continuously for 10 seconds
   - Should maintain 60 FPS (no jank)
   - Use: `requestAnimationFrame` timing

---

## Rollback Plan

If migration introduces critical issues:

### Immediate Rollback (< 1 hour)

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset branch
git reset --hard HEAD~1
git push origin main --force  # Use with caution
```

### Partial Rollback (Keep New Code)

Add feature flag to toggle between APIs:

```typescript
// src/main/tab-manager.ts
const USE_WEBCONTENTSVIEW = process.env.USE_WEBCONTENTSVIEW === 'true';

openUrl(url: string): { tabId: string; tab: TabData } {
  const view = USE_WEBCONTENTSVIEW
    ? new WebContentsView({ /* ... */ })
    : new BrowserView({ /* ... */ });

  // ...

  if (USE_WEBCONTENTSVIEW) {
    this.mainWindow.contentView.addChildView(view);
  } else {
    this.mainWindow.addBrowserView(view);
  }
}
```

This allows:
- Testing both APIs side-by-side
- Gradual rollout
- Easy revert via environment variable

---

## Future Enhancements

After successful migration, consider these optimizations:

### 1. Auto-Resize Optimization

Replace manual bounds management with `setAutoResize()`:

```typescript
// Remove resize handler:
// this.mainWindow.on('resize', () => this.updateWebContentsViewBounds());

// Set up auto-resize when creating view:
view.setBounds({ x: SIDEBAR_WIDTH, y: HEADER_HEIGHT, width: w, height: h });
view.setAutoResize({
  width: true,
  height: true,
  horizontal: true,
  vertical: true,
});
```

**Benefit:** Eliminates ~10-20 resize handler calls per second during window drag.

### 2. View Pooling

Instead of destroying views on tab close, reuse them:

```typescript
class TabManager {
  private viewPool: WebContentsView[] = [];

  private getOrCreateView(): WebContentsView {
    return this.viewPool.pop() || new WebContentsView({ /* ... */ });
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab?.view) {
      this.mainWindow.contentView.removeChildView(tab.view);
      this.viewPool.push(tab.view);  // Reuse instead of destroy
      // Only destroy if pool size > 10
      if (this.viewPool.length > 10) {
        const oldView = this.viewPool.shift();
        oldView?.webContents.destroy();
      }
    }
  }
}
```

**Benefit:** Faster tab creation (50-100ms → 5-10ms).

### 3. View Visibility API

Use `view.setVisible(false)` instead of removing from hierarchy:

```typescript
setActiveTab(tabId: string): void {
  // Hide all views
  for (const [id, tab] of this.tabs) {
    if (tab.view) {
      tab.view.setVisible(id === tabId);
    }
  }
}
```

**Benefit:** Eliminates add/remove overhead (may reduce jank on tab switching).

---

## Resources

### Official Documentation

- [Electron WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron Migration Guide](https://www.electronjs.org/docs/latest/breaking-changes)
- [BrowserView Deprecation Notice](https://www.electronjs.org/docs/latest/api/browser-view)

### Related Issues

- [Electron Issue #35658: Deprecate BrowserView](https://github.com/electron/electron/issues/35658)
- [Electron PR #35337: Add WebContentsView](https://github.com/electron/electron/pull/35337)

### Community Resources

- [Migrating from BrowserView to WebContentsView (Stack Overflow)](https://stackoverflow.com/questions/tagged/electron+webcontentsview)
- [Electron Discord #help channel](https://discord.gg/electron)

---

## Appendix A: Full File Diff

### src/main/tab-manager.ts

**Key Changes:**
1. Line 1: Import `WebContentsView` instead of `BrowserView`
2. Line 7-9: Update `TabWithView` interface
3. Line 16: Rename `activeBrowserView` → `activeWebContentsView`
4. Line 42-55: Rename method `updateBrowserViewBounds()` → `updateWebContentsViewBounds()`
5. Line 64, 115: Update type signatures for `setupContextMenu()` and `setupWindowOpenHandler()`
6. Line 128-133: Change `new BrowserView()` → `new WebContentsView()`
7. Line 187: Update `openNote()` view creation
8. Line 643, 675, 685, 690: Update view attachment/detachment to use `contentView.addChildView/removeChildView`

### tests/main/tab-manager.test.js

**Key Changes:**
1. Update `vi.mock('electron')` to export `WebContentsView` instead of `BrowserView`
2. Add `contentView: { addChildView, removeChildView }` to `BrowserWindow` mock
3. Update all test assertions from `addBrowserView/removeBrowserView` to `contentView.addChildView/removeChildView`

---

## Appendix B: Electron Version Compatibility

| Electron Version | BrowserView | WebContentsView | Recommendation |
|------------------|-------------|-----------------|----------------|
| < 30.0.0 | ✅ Supported | ❌ Not available | Stay on BrowserView |
| 30.x - 32.x | ⚠️ Deprecated | ✅ Available | Migrate to WebContentsView |
| 33.x - 35.x | ⚠️ Deprecated | ✅ Recommended | **Current version (33.0.0)** |
| 36.x+ (future) | ❌ May be removed | ✅ Only option | Must use WebContentsView |

**Current Project Status:** Electron 39.2.2
- ✅ Safe to migrate to WebContentsView
- ⚠️ BrowserView still works but deprecated
- 📅 Estimated removal: Electron 40-42 (mid-2025)

---

## Appendix C: Screenshot Service Notes

**File:** `src/main/services/screenshot-service.ts`

The `ScreenshotService` uses `BrowserWindow` for the overlay, not `BrowserView/WebContentsView`. This is correct and requires **no changes**.

```typescript
// This is correct - overlay is a BrowserWindow, not a view
this.overlayWindow = new BrowserWindow({
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  // ...
});
```

The overlay is a separate window, not embedded content, so it doesn't participate in the BrowserView → WebContentsView migration.

---

*Document Version: 1.0*
*Created: 2025-11-27*
*Author: Migration Guide for llm-sv-tabs*
*Electron Version: 39.2.2*
