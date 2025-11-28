# Implementation Prompt: BrowserView → WebContentsView Migration

## Context

You are implementing the migration from Electron's deprecated `BrowserView` API to the modern `WebContentsView` API. The migration guide has been prepared and design docs have been updated to reflect the new API.

## What Was Done Previously

1. ✅ **Created comprehensive migration guide** - `BROWSERVIEW_TO_WEBCONTENTSVIEW_MIGRATION.md`
2. ✅ **Updated design docs** to use WebContentsView:
   - `design/02-visual-layout.md` - Visual layout and tab switching examples
   - `design/03-flexible-tab-system.md` - Hybrid architecture and tab lifecycle
3. ✅ **Sanity checked actual code** - Confirmed only 3 BrowserView instantiations exist
4. ✅ **Rebased on latest main** - Includes screenshot feature and API keys tab

## Your Task

Implement the migration following the guide in `BROWSERVIEW_TO_WEBCONTENTSVIEW_MIGRATION.md`.

## Step-by-Step Implementation

### 1. Read the Migration Guide (5 min)
```bash
# Review the full migration plan
cat BROWSERVIEW_TO_WEBCONTENTSVIEW_MIGRATION.md
```

### 2. Phase 1: Type Updates (30 min)

**File:** `src/main/tab-manager.ts`

Update imports and type definitions:
```typescript
// Line 1: Change import
import { WebContentsView, BrowserWindow, Menu, MenuItem } from 'electron';

// Line 7-9: Update interface
interface TabWithView extends Tab {
  view?: WebContentsView;  // Changed from BrowserView
  component?: 'llm-response' | 'note' | 'api-key-instructions';
}

// Line 16: Rename variable
private activeWebContentsView: WebContentsView | null;  // Changed from activeBrowserView

// Line 31: Update comment
this.mainWindow.on('resize', () => this.updateWebContentsViewBounds());

// Line 42: Rename method
private updateWebContentsViewBounds(): void {
  // Keep implementation same for now
}
```

**File:** `src/main/services/content-extractor.ts`

Update type signature:
```typescript
// Line 5: Change import
import { WebContentsView } from 'electron';

// Method signature
static async extractFromTab(
  view: WebContentsView,  // Changed from BrowserView
  tabId: string,
  includeMedia: boolean = false
): Promise<ExtractedContent> {
  // Implementation unchanged - uses view.webContents
}
```

### 3. Phase 2: TabManager Methods (1-2 hours)

**Three locations to update:**

#### Location 1: `openUrl()` - line ~128
```typescript
const view = new WebContentsView({  // Changed from BrowserView
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

#### Location 2: `openNoteTab()` - line ~194
```typescript
const view = new WebContentsView({  // Changed from BrowserView
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

#### Location 3: Raw message viewer - line ~388
```typescript
const view = new WebContentsView({  // Changed from BrowserView
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

**Update view attachment/detachment** (3 locations):

Search for `addBrowserView` and `removeBrowserView`:
```bash
grep -n "addBrowserView\|removeBrowserView" src/main/tab-manager.ts
```

Replace:
```typescript
// Before
this.mainWindow.removeBrowserView(tab.view);
this.mainWindow.addBrowserView(tab.view);

// After
this.mainWindow.contentView.removeChildView(tab.view);
this.mainWindow.contentView.addChildView(tab.view);
```

**Update variable references:**
```typescript
// Find all references to activeBrowserView
// Replace with activeWebContentsView
```

### 4. Phase 3: Update Tests (30-45 min)

**File:** `tests/main/tab-manager.test.js`

Update mock:
```javascript
vi.mock('electron', () => ({
  WebContentsView: vi.fn(() => ({  // Changed from BrowserView
    webContents: {
      loadURL: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    setBounds: vi.fn(),
    setAutoResize: vi.fn(),  // New method
  })),
  BrowserWindow: vi.fn(() => ({
    // ... existing mocks ...
    contentView: {  // NEW: Add contentView mock
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    // Keep old methods for now (backward compat during migration)
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
  })),
  // ... rest of mocks
}));
```

Update test assertions:
```javascript
// Find and replace in test files
expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(expect.any(Object));
expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(expect.any(Object));
```

### 5. Run Tests (10 min)

```bash
npm test
```

Expected: All 80+ tests should pass. If failures occur, check:
1. Mock setup is correct
2. All `addBrowserView/removeBrowserView` calls updated
3. Variable names updated (`activeBrowserView` → `activeWebContentsView`)

### 6. Manual Testing (30 min)

**Critical test scenarios:**

```bash
# Start the app
npm run electron:dev
```

**Test checklist:**
- [ ] Create new tab via URL input → Tab appears
- [ ] Switch between tabs → Content switches correctly
- [ ] Close tabs → No errors, view is destroyed
- [ ] Context menu (right-click tab) → Reload, copy URL work
- [ ] Right-click link → Open in new tab works
- [ ] Screenshot capture (Ctrl+Alt+S) → Image tab created
- [ ] LLM query with selected tabs → Content extracted correctly
- [ ] Upload file → Note/PDF tab created
- [ ] Window resize → View bounds update (content not clipped)
- [ ] Session persistence → Close app, reopen, tabs restored

### 7. Commit and Push (5 min)

```bash
git add src/main/tab-manager.ts
git add src/main/services/content-extractor.ts
git add tests/main/tab-manager.test.js

git commit -m "Migrate from BrowserView to WebContentsView

Replace deprecated BrowserView API with modern WebContentsView across
the codebase. All view management now uses contentView.addChildView/
removeChildView instead of direct window attachment.

Changes:
- Update imports: BrowserView → WebContentsView
- Update type definitions in TabManager and ContentExtractor
- Replace new BrowserView() → new WebContentsView() (3 locations)
- Replace addBrowserView → contentView.addChildView
- Replace removeBrowserView → contentView.removeChildView
- Rename activeBrowserView → activeWebContentsView
- Update test mocks for new API
- All 80+ tests passing
- Manual testing completed (tab lifecycle, screenshots, LLM queries)

Fixes: Removes usage of deprecated Electron API
See: BROWSERVIEW_TO_WEBCONTENTSVIEW_MIGRATION.md"

git push -u origin claude/investigate-view-history-014azoVLeXmpd2RQQok4U4T6
```

## Troubleshooting

### Issue: Tests failing with "addBrowserView is not a function"

**Cause:** Test mocks not updated

**Fix:** Ensure `BrowserWindow` mock has `contentView` with `addChildView/removeChildView`

### Issue: Views not showing after tab switch

**Cause:** Forgot to call `setBounds()` after `addChildView`

**Fix:** Verify tab switching code calls:
```typescript
this.mainWindow.contentView.addChildView(tab.view);
tab.view.setBounds(this.calculateBounds());  // Must call this!
```

### Issue: Multiple views visible at once

**Cause:** Not removing previous view before adding new one

**Fix:** Always remove old view first:
```typescript
if (this.activeWebContentsView) {
  this.mainWindow.contentView.removeChildView(this.activeWebContentsView);
}
this.mainWindow.contentView.addChildView(newView);
```

## Success Criteria

✅ All tests passing (`npm test`)
✅ Manual testing checklist complete
✅ No console errors in Electron DevTools
✅ Tab switching works smoothly
✅ Screenshot capture works
✅ LLM queries work with content extraction
✅ Session persistence works
✅ Code committed and pushed

## Expected Time

- **Fast path (no issues):** 2-3 hours
- **With debugging:** 3-4 hours
- **Conservative estimate:** 4-6 hours

## Reference Files

- **Migration guide:** `BROWSERVIEW_TO_WEBCONTENTSVIEW_MIGRATION.md`
- **Design docs:** `design/02-visual-layout.md`, `design/03-flexible-tab-system.md`
- **Main code:** `src/main/tab-manager.ts` (search for `new BrowserView`)
- **Tests:** `tests/main/tab-manager.test.js`

## Quick Reference: API Changes

```typescript
// Imports
- import { BrowserView } from 'electron';
+ import { WebContentsView } from 'electron';

// Instantiation
- const view = new BrowserView({ ... });
+ const view = new WebContentsView({ ... });

// Attachment
- mainWindow.addBrowserView(view);
+ mainWindow.contentView.addChildView(view);

// Detachment
- mainWindow.removeBrowserView(view);
+ mainWindow.contentView.removeChildView(view);

// Everything else stays the same!
- view.webContents.loadURL(url);        ✅ No change
- view.setBounds({ x, y, w, h });       ✅ No change
- view.webContents.on('...', ...);      ✅ No change
- view.webContents.destroy();           ✅ No change
```

---

**Ready to start? Read the migration guide first, then begin with Phase 1!**

**Good luck! 🚀**
