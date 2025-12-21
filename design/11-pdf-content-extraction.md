# PDF Content Extraction Reference Implementation

A robust baseline for extracting text and page images from PDFs in Electron/Node.js applications, designed for downstream LLM consumption.

## Overview

This implementation uses **pdfjs-dist** (Mozilla's PDF.js) with **@napi-rs/canvas** to extract:
- **Text**: Raw text content from each page
- **Images**: Full-page renders as PNG data URLs

The approach prioritizes reliability and compatibility over advanced layout analysis, making it an excellent starting point that works with virtually any PDF.

## Stack

| Package | Version | Purpose |
|---------|---------|---------|
| `pdfjs-dist` | ^5.4.x | PDF parsing, text extraction, page rendering |
| `@napi-rs/canvas` | ^0.1.x | Server-side canvas (Node.js compatible) |
| `electron` | ^39.x | Desktop app framework |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│                                                             │
│  pdf-extractor.ts                                           │
│  ├─ extractPdfText()      → Text-only extraction            │
│  ├─ extractPdfContent()   → Text + images                   │
│  └─ renderPageImage()     → Single page to PNG              │
│                                                             │
│  Uses:                                                      │
│  • pdfjs-dist/legacy/build/pdf.mjs (ESM, Node-compatible)   │
│  • @napi-rs/canvas for server-side rendering                │
└─────────────────────────────────────────────────────────────┘
                              │
                         IPC Bridge
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                         │
│  • Invoke extraction via IPC                                │
│  • Display/process results                                  │
│  • Send to LLM API                                          │
└─────────────────────────────────────────────────────────────┘
```

## Key Implementation Details

### 1. Browser Globals Polyfill (Critical)

pdfjs-dist 5.x expects browser globals. You **must** polyfill these before any pdf.js imports:

```typescript
import { createCanvas, Image, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

const g = globalThis as any;
if (!g.Image) g.Image = Image;
if (!g.DOMMatrix) g.DOMMatrix = DOMMatrix;
if (!g.ImageData) g.ImageData = ImageData;
if (!g.Path2D) g.Path2D = Path2D;
```

**Why?** Without these, embedded images in PDFs will fail to render with cryptic errors like "Image or Canvas expected".

### 2. Worker and Font Configuration

```typescript
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Point to the worker script (enables multi-threaded parsing)
const workerPath = path.join(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

// Standard fonts for proper text rendering
const standardFontPath = path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/');
(GlobalWorkerOptions as any).standardFontDataUrl = `${pathToFileURL(standardFontPath).href}`;
```

### 3. Text Extraction

```typescript
export async function extractPdfText(filePath: string): Promise<TextExtractionResult> {
  const loadingTask = getDocument({ url: pathToFileURL(filePath).href });
  const doc = await loadingTask.promise;

  const pages: PageText[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // Simple concatenation - works reliably for all PDFs
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    pages.push({ pageNumber: i, text });
  }

  return { pages, pageCount: doc.numPages };
}
```

### 4. Page Rendering with Canvas Factory

The canvas factory pattern is **essential** for PDFs with embedded images:

```typescript
async function renderPageImage(doc: any, pageNumber: number): Promise<PageImage> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 }); // Adjust for quality vs size
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  // Canvas factory - prevents pdf.js from creating browser canvases
  const canvasFactory = {
    create(width: number, height: number) {
      const nodeCanvas = createCanvas(width, height);
      return { canvas: nodeCanvas, context: nodeCanvas.getContext('2d') };
    },
    reset(canvasAndContext: { canvas: any }, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },
    destroy(canvasAndContext: { canvas: any; context: any }) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    },
  };

  await page.render({
    canvasContext: context,
    viewport,
    canvasFactory
  }).promise;

  return {
    pageNumber,
    dataUrl: canvas.toDataURL('image/png'),
  };
}
```

### 5. Combined Extraction

```typescript
export async function extractPdfContent(filePath: string): Promise<PdfExtractedContent> {
  const loadingTask = getDocument({ url: pathToFileURL(filePath).href });
  const doc = await loadingTask.promise;

  const textPages: PageText[] = [];
  const images: PageImage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    // Extract text
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ');
    textPages.push({ pageNumber: i, text });

    // Render page image
    const image = await renderPageImage(doc, i);
    images.push(image);
  }

  return { textPages, images };
}
```

## Type Definitions

```typescript
// src/types.ts

export interface PageText {
  pageNumber: number;
  text: string;
  extractionTimeMs?: number;
}

export interface PageImage {
  pageNumber: number;
  dataUrl: string;  // PNG as data URL
  captureTimeMs?: number;
}

export interface PdfExtractedContent {
  textPages: PageText[];
  images: PageImage[];
  totalExtractionTimeMs?: number;
}
```

## IPC Integration (Electron)

### Main Process

```typescript
// main.ts
import { ipcMain } from 'electron';
import { extractPdfContent } from './services/pdf-extractor';

ipcMain.handle('extract-pdf-content', async (_event, filePath: string) => {
  return extractPdfContent(filePath);
});
```

### Preload Script

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  extractPdfContent: (filePath: string) =>
    ipcRenderer.invoke('extract-pdf-content', filePath),
});
```

### Renderer (Svelte 5)

```typescript
// In your Svelte component
const result = await window.electronAPI.extractPdfContent(pdfPath);

// For LLM consumption, you might structure it as:
const messages = result.textPages.map((page, i) => ({
  role: 'user',
  content: [
    { type: 'text', text: `Page ${page.pageNumber}:\n${page.text}` },
    { type: 'image_url', url: result.images[i].dataUrl }
  ]
}));
```

## LLM Tokenization Considerations

### Text Tokens
- Each page's text can be sent directly
- Consider chunking long pages (Claude/GPT context limits)
- Preserve page boundaries for citation

### Image Tokens
- PNG data URLs work directly with vision models
- Scale factor (1.5x default) balances quality vs token cost
- Higher scale = more detail but more tokens
- Consider JPEG for smaller payloads: `canvas.toDataURL('image/jpeg', 0.85)`

### Recommended Structure for LLM

```typescript
interface PDFForLLM {
  metadata: {
    filename: string;
    pageCount: number;
  };
  pages: Array<{
    pageNumber: number;
    text: string;
    imageDataUrl: string;  // or null if text-only mode
  }>;
}
```

## Configuration Options

| Setting | Default | Notes |
|---------|---------|-------|
| `scale` | 1.5 | Viewport scale. 1.0 = 72 DPI, 2.0 = 144 DPI |
| `format` | PNG | Use JPEG for smaller files |
| `quality` | 1.0 | JPEG quality (0.0-1.0) |

## Troubleshooting

### "Image or Canvas expected" Error
→ Missing canvas factory or browser globals polyfill

### Blank/Black Pages
→ Check that `@napi-rs/canvas` is installed correctly (native module)

### Worker Errors
→ Verify `workerSrc` path resolves correctly in your build output

### Missing Fonts
→ Set `standardFontDataUrl` to the pdfjs-dist standard_fonts directory

## Dependencies (package.json)

```json
{
  "dependencies": {
    "@napi-rs/canvas": "^0.1.84",
    "pdfjs-dist": "^5.4.449"
  }
}
```

## Why This Approach?

1. **Reliability**: Works with virtually any PDF (scanned, native, mixed)
2. **Simplicity**: No complex layout analysis that can fail
3. **LLM-Ready**: Vision models can interpret layout from images
4. **Permissive License**: Both libraries are Apache-2.0/MIT compatible
5. **Electron-Native**: Runs in main process, no browser dependencies

## Future Enhancements

When you need more than this baseline:

- **Spatial text extraction**: Use `textContent.items[].transform` for coordinates
- **Embedded image extraction**: Use `page.getOperatorList()` with `OPS.paintImageXObject`
- **Document structure**: Use `page.getStructTree()` for tagged PDFs
- **Localized crops**: Render specific regions instead of full pages

See the reference implementation at: `src/main/services/pdf-extractor.ts`
