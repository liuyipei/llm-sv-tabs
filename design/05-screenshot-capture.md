# Screenshot Capture with Electron

## Overview

Native screenshot capture implementation using Electron's `desktopCapturer` API. Users can capture screen regions via drag-to-select overlay, with screenshots automatically opening as image tabs ready for LLM analysis.

**Key characteristics:**
- Zero external dependencies (uses only Electron built-in APIs)
- Cross-platform (Windows, macOS, Linux)
- High-DPI/Retina display support
- Global keyboard shortcuts
- Integration with tab system

---

## Architecture

### Components

1. **ScreenshotService** (`src/main/services/screenshot-service.ts`)
   - Orchestrates capture workflow
   - Manages overlay window lifecycle
   - Handles HiDPI scaling and image cropping

2. **Screenshot Overlay** (`src/main/services/screenshot-overlay.html`)
   - Frameless, fullscreen window
   - Canvas-based selection UI
   - Real-time dimension display

3. **Tab System Integration**
   - IPC bridge for renderer ↔ main communication
   - Automatic image tab creation
   - Base64 PNG data URLs

---

## Implementation

### Screenshot Service

**File:** `src/main/services/screenshot-service.ts`

```typescript
export class ScreenshotService {
  private overlayWindow: BrowserWindow | null = null;
  private capturedScreenImage: NativeImage | null = null;
  private resolveCapture: ((dataUrl: string | null) => void) | null = null;

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
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor;

    // Calculate thumbnail size accounting for HiDPI
    const thumbnailSize = {
      width: Math.floor(displayBounds.width * scaleFactor),
      height: Math.floor(displayBounds.height * scaleFactor),
    };

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: thumbnailSize,
    });

    this.capturedScreenImage = sources[0].thumbnail;
  }

  private handleRegionSelected(bounds: Rectangle): void {
    // Adjust bounds for HiDPI displays
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

    // Clear state BEFORE cleanup to prevent re-entry
    const resolve = this.resolveCapture;
    this.resolveCapture = null;
    this.cleanup();

    if (resolve) {
      resolve(dataUrl);
    }
  }

  private cleanup(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      // Remove listeners before closing to prevent recursion
      this.overlayWindow.removeAllListeners('close');
      this.overlayWindow.close();
    }
    this.overlayWindow = null;
    this.capturedScreenImage = null;
  }
}
```

### User Interaction Flow

1. **Trigger:** User clicks "📸 Screenshot" button or presses `Ctrl+Alt+S` (macOS: `Cmd+Alt+S`)
2. **Capture:** Desktop is captured via `desktopCapturer.getSources()`
3. **Overlay:** Frameless, transparent overlay window appears over entire screen
4. **Selection:** User drags to select region (dimensions shown in real-time)
5. **Completion:** Selected region is cropped and opened as new image tab
6. **Cancel:** ESC key closes overlay without action

### Overlay Window

**File:** `src/main/services/screenshot-overlay.html`

Features:
- HTML5 Canvas for drawing selection rectangle
- Real-time dimension display (`width × height`)
- Visual feedback with blue highlight and corner handles
- ESC key cancellation
- Minimum region size validation (10×10 pixels)

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
  } else {
    ipcRenderer.send('screenshot-cancelled');
  }
});

// ESC to cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('screenshot-cancelled');
  }
});
```

### Tab Creation

Screenshots automatically create new image tabs:

```typescript
// In main.ts IPC handler
ipcMain.handle('trigger-screenshot', async () => {
  const dataUrl = await screenshotService.startCapture();

  if (dataUrl) {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).replace(/\//g, '-').replace(',', '');

    const title = `Screenshot ${timestamp}`;
    tabManager.openNoteTab(Date.now(), title, dataUrl, 'image', true);
  }
});
```

**Tab properties:**
- Type: `'notes'`
- FileType: `'image'`
- Title: `"Screenshot YYYY-MM-DD HH:MM:SS"`
- Content: Base64 PNG data URL
- Auto-selected: Yes (immediately visible)

---

## Global Shortcuts

**Registration** (in `main.ts`):

```typescript
function setupGlobalShortcuts(): void {
  const shortcut = process.platform === 'darwin'
    ? 'CommandOrControl+Alt+S'
    : 'Ctrl+Alt+S';

  globalShortcut.register(shortcut, async () => {
    const dataUrl = await screenshotService.startCapture();
    if (dataUrl) {
      const timestamp = /* ... */;
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

---

## Cross-Platform Support

### Windows/Linux
- **Shortcut:** `Ctrl+Alt+S`
- **Display scaling:** Automatically handled via `scaleFactor`
- **Permissions:** No special permissions required

### macOS
- **Shortcut:** `Cmd+Alt+S`
- **Display scaling:** Retina displays automatically handled via `scaleFactor`
- **Permissions:** Requires **Screen Recording** permission

**macOS Permission Handling:**

```typescript
try {
  sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: thumbnailSize,
  });
} catch (error) {
  // On macOS, permission denial throws "Failed to get sources"
  const errorMsg = process.platform === 'darwin'
    ? 'Screen Recording permission denied.\n\n' +
      'To fix:\n' +
      '1. Open System Preferences → Security & Privacy → Privacy\n' +
      '2. Select "Screen Recording" from the left sidebar\n' +
      '3. Check the box next to "Electron"\n' +
      '4. Restart this app\n\n' +
      'The Electron app is located at:\n' +
      '/path/to/node_modules/electron/dist/Electron.app'
    : 'Failed to capture screen. Please check your system permissions.';
  throw new Error(errorMsg);
}

if (sources.length === 0) {
  // Permission granted but no sources (rare)
  const errorMsg = process.platform === 'darwin'
    ? 'No screen sources available. Please add Electron to Screen Recording permissions.'
    : 'No screen sources available. Please check your system permissions.';
  throw new Error(errorMsg);
}
```

---

## High-DPI Handling

All screen coordinates must be scaled by the display's `scaleFactor` before image operations:

```typescript
const display = screen.getPrimaryDisplay();
const scaleFactor = display.scaleFactor; // 1.0, 1.5, 2.0, etc.

// When capturing desktop
const thumbnailSize = {
  width: Math.floor(displayBounds.width * scaleFactor),
  height: Math.floor(displayBounds.height * scaleFactor),
};

// When cropping selected region
const scaledBounds = {
  x: bounds.x * scaleFactor,
  y: bounds.y * scaleFactor,
  width: bounds.width * scaleFactor,
  height: bounds.height * scaleFactor
};

const croppedImage = sourceImage.crop(scaledBounds);
```

**Why this matters:**
- On 2x Retina displays, a 1920×1080 logical display is actually 3840×2160 pixels
- User selects region in logical coordinates (e.g., 100×100)
- Must multiply by `scaleFactor` (2.0) to get actual pixel coordinates (200×200)
- Otherwise, screenshot will be cropped incorrectly or appear blurry

---

## UI Integration

### NotesSection Component

**File:** `src/ui/components/notes/NotesSection.svelte`

```svelte
<button
  onclick={handleScreenshotClick}
  class="action-btn screenshot-btn"
  title="Capture screen region (Ctrl+Alt+S)"
>
  📸 Screenshot
</button>

<script lang="ts">
async function handleScreenshotClick(): Promise<void> {
  if (!ipc) return;

  try {
    const result = await ipc.triggerScreenshot();
    if (!result.success) {
      console.error('Screenshot failed:', result.error);
      uploadErrors = [...uploadErrors, result.error || 'Screenshot failed'];
    }
  } catch (error) {
    console.error('Screenshot error:', error);
    uploadErrors = [...uploadErrors, 'Screenshot error: ' + String(error)];
  }
}
</script>

<style>
.screenshot-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.screenshot-btn:hover {
  background: linear-gradient(135deg, #5568d3 0%, #6a3f8e 100%);
}
</style>
```

### Error Display

**File:** `src/ui/components/notes/UploadErrors.svelte`

```svelte
<style>
.error-message {
  background-color: #5a1d1d;
  border: 1px solid #be1100;
  padding: 12px 15px;
  color: #f48771;
  white-space: pre-wrap;      /* Preserve newlines in error messages */
  word-wrap: break-word;       /* Wrap long lines */
}
</style>
```

---

## Build Process Integration

### Asset Copying

**File:** `package.json`

```json
{
  "scripts": {
    "build:main": "tsc --project tsconfig.main.json && npm run copy:assets",
    "copy:assets": "mkdir -p dist-main/main/services && cp src/main/services/screenshot-overlay.html dist-main/main/services/"
  }
}
```

**Why this is needed:**
- TypeScript compilation (`tsc`) only processes `.ts` files
- The overlay HTML file is not a TypeScript file
- Must explicitly copy non-TS assets to the output directory
- The service uses `__dirname` to load the HTML, which points to `dist-main/main/services/` at runtime

---

## Technical Specifications

### Image Format
- **Format:** PNG
- **Encoding:** Base64 data URL
- **Color depth:** 32-bit RGBA
- **Compression:** Default PNG compression

### Performance
- **Desktop capture:** 100-300ms (depends on resolution)
- **Overlay creation:** ~50ms
- **Image crop & encode:** 20-50ms
- **Total latency:** < 500ms for typical use

### Memory Usage
- **4K display capture:** ~25MB (temporary)
- **Immediate cleanup** after cropping
- **No persistent storage** (image stored in tab metadata as base64)

---

## Use Cases

1. **Visual bug reports:** Capture UI issues from any application for LLM analysis
2. **Design reference:** Screenshot designs for comparison or iteration
3. **Documentation:** Capture UI states for notes and documentation
4. **Code snippets:** Screenshot code from other applications or terminals
5. **Research:** Capture content from anywhere for multimodal LLM queries

---

## Key Implementation Takeaways

### 1. macOS Screen Recording Permission is Non-Negotiable
- `desktopCapturer.getSources()` throws on permission denial
- Wrap in try-catch with platform-specific, actionable error messages
- Include exact paths to the Electron app binary
- Provide step-by-step System Preferences navigation

**Implementation:**
```typescript
try {
  sources = await desktopCapturer.getSources({ types: ['screen'] });
} catch (error) {
  if (process.platform === 'darwin') {
    throw new Error(`Screen Recording permission denied.\n\n` +
      `To fix:\n1. Open System Preferences → Security & Privacy\n` +
      `2. Add Electron.app at: ${electronAppPath}`);
  }
}
```

### 2. Event Listener Cleanup Prevents Infinite Recursion
- Remove event listeners **before** closing windows
- Clear callback flags **before** triggering cleanup
- Pattern: Save callback → clear flag → cleanup → invoke callback

**Anti-pattern (causes recursion):**
```typescript
// BAD: cleanup() closes window → triggers 'close' event → calls cancel() again
cancel() {
  this.cleanup();  // Closes window
  this.resolveCapture = null;  // Too late!
}
```

**Correct pattern:**
```typescript
// GOOD: Clear flag first to break the cycle
cancel() {
  const resolve = this.resolveCapture;
  this.resolveCapture = null;  // Clear FIRST
  this.cleanup();              // Now safe to close
  if (resolve) resolve(null);
}

cleanup() {
  if (this.overlayWindow) {
    this.overlayWindow.removeAllListeners('close');  // Remove listeners
    this.overlayWindow.close();
  }
}
```

### 3. Build Process Must Copy Non-TypeScript Assets
- `tsc` only compiles `.ts` files, doesn't copy HTML/CSS/images
- Add explicit copy step to build scripts
- Use `mkdir -p` for cross-platform directory creation
- Verify `__dirname` paths in compiled output match expectations

**Required changes:**
```json
// package.json
"build:main": "tsc && npm run copy:assets",
"copy:assets": "mkdir -p dist-main/services && cp src/services/*.html dist-main/services/"
```

### 4. Multi-Line Error Messages Need CSS Consideration
- Error messages with `\n` require `white-space: pre-wrap`
- Fixed-position error containers work better than modals for long messages
- Consider max-width and viewport overflow

**CSS requirements:**
```css
.error-message {
  white-space: pre-wrap;   /* Preserve \n newlines */
  word-wrap: break-word;   /* Wrap long lines */
  max-width: 400px;        /* Prevent excessive width */
}
```

### 5. HiDPI Coordinate Scaling is Critical
- Always multiply logical coordinates by `scaleFactor` before image operations
- This applies to: desktop capture size, crop bounds, image dimensions
- Test on both standard (1.0) and Retina (2.0) displays
- Mismatch causes blurry screenshots or incorrect cropping

**Common mistake:**
```typescript
// BAD: Using logical size directly
const sources = await desktopCapturer.getSources({
  thumbnailSize: { width: 1920, height: 1080 }  // Wrong on 2x display!
});

// GOOD: Scale by display factor
const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
const sources = await desktopCapturer.getSources({
  thumbnailSize: {
    width: 1920 * scaleFactor,   // 3840 on Retina
    height: 1080 * scaleFactor   // 2160 on Retina
  }
});
```

### 6. Prefer Electron Native APIs Over npm Packages
- Electron's `desktopCapturer` eliminates dependencies on packages like `electron-screenshots`
- Native APIs have better platform integration (permissions, display info)
- Fewer security audit concerns
- No version compatibility issues between packages and Electron

**Trade-offs to consider:**
- Native APIs may have less documentation or examples
- May need to implement more UI yourself (like the overlay)
- Worth it for production apps to reduce dependency surface area

### 7. IPC Communication Requires Bidirectional Setup
- Main process handlers: `ipcMain.handle()` for async request/response
- Overlay communication: `ipcMain.on()` for fire-and-forget events
- Preload script: Expose safe IPC methods via `contextBridge`
- UI components: Call exposed methods via `window.electronAPI`

**Common patterns:**
```typescript
// Main process: Request/response (waits for result)
ipcMain.handle('trigger-screenshot', async () => {
  const dataUrl = await screenshotService.startCapture();
  return { success: true, data: dataUrl };
});

// Main process: Event listeners (no response expected)
ipcMain.on('screenshot-cancelled', () => {
  screenshotService.cancel();
});

// Preload: Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  triggerScreenshot: () => ipcRenderer.invoke('trigger-screenshot')
});
```

---

## Future Enhancements

Potential additions to consider:

1. **Annotation tools:** Draw arrows, text, highlights on screenshots before saving
2. **Delay timer:** "Capture in 3 seconds" for capturing menus or hover states
3. **Window capture:** Capture specific application windows instead of regions
4. **Scrolling capture:** Full-page captures of long web content
5. **Multi-monitor improvements:** Better support for secondary displays
6. **OCR integration:** Extract text from screenshots for searching
7. **Video recording:** Capture screen regions as video clips

---

## Code Organization

```
src/main/services/
├── screenshot-service.ts      # Core screenshot service
├── screenshot-overlay.html    # Region selection UI
├── content-extractor.ts       # Webpage content extraction
└── image-resizer.ts           # Image resizing for LLM queries

src/main/
├── main.ts                    # Global shortcut registration, IPC handlers
└── preload.ts                 # IPC bridge exposure

src/ui/components/notes/
├── NotesSection.svelte        # Screenshot button UI
└── UploadErrors.svelte        # Error display component

src/ui/lib/
└── ipc-bridge.ts              # IPC method definitions

src/types.ts                   # Rectangle interface, type definitions
```

### Type Definitions

```typescript
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IPCBridge {
  triggerScreenshot(): Promise<IPCResponse<{ success: boolean }>>;
  // ... other methods
}
```

---

## Summary

This screenshot implementation demonstrates:
- **Zero-dependency approach** using Electron native APIs
- **Cross-platform compatibility** with platform-specific permission handling
- **Proper resource management** with event cleanup and state clearing
- **HiDPI awareness** for crisp screenshots on all displays
- **Seamless integration** with the tab system for immediate LLM analysis
