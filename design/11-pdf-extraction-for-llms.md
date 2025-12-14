# Design Document 11: PDF Extraction for LLMs

## Overview

PDF extraction for LLMs provides a hybrid approach that combines text extraction with paginated image previews, enabling vision-capable models to accurately process PDF content including tables, charts, and complex layouts.

## Problem Statement

**Challenge**: PDFs can contain both text and visual content (tables, charts, diagrams) that require different extraction strategies:

1. **Text extraction alone loses formatting**: Converting PDF text to plain text destroys table structure, making complex data unreadable
2. **Single screenshot misses multi-page content**: Capturing only the visible page excludes content from 60+ page documents
3. **No graceful degradation**: If the PDF view isn't loaded, extraction fails silently with empty content
4. **Vision models excel at visual interpretation**: Modern LLMs (Claude 3.5 Sonnet, GPT-4V) can read tables from images more accurately than text extraction from poorly structured PDFs

## Solution: Hybrid Extraction with Paginated Previews

The PDF extractor uses a **multi-strategy approach**:

```
┌─────────────┐
│  PDF Tab    │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ Extract Text Layer  │ (searchable text from PDF.js textLayer)
│ + Capture Previews  │ (screenshots of first N pages)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Return Hybrid PDFContent    │
│ - text: string              │
│ - numPages: number          │
│ - imageData: preview page 1 │
│ - images: preview pages 2-N │
└─────────────────────────────┘
```

### Text Extraction Strategy

**When**: PDF contains searchable text (not scanned/image-based)

**Processing** (using `pdfjs-dist` library in Node.js):
1. **Load PDF document**: Use `pdfjsLib.getDocument(filePath)` to load PDF from file system
2. **Iterate through pages**: Loop through all pages (1 to `doc.numPages`)
3. **Extract text content**: For each page, call `page.getTextContent()` to get text items
4. **Join text items**: Map text items to strings and join with spaces
5. **Combine pages**: Join all pages with double newlines

**Output Example**:
```typescript
{
  text: "Page 1 content\n\nPage 2 content\n\n...",
  numPages: 45
}
```

**Benefits**:
- ✅ **Reliable for any PDF size** - No DOM virtualization issues (30+ page PDFs work perfectly)
- ✅ **Lightweight** - Text is ~4x cheaper than images in tokens
- ✅ **Fast** - Direct extraction from PDF data model (no rendering needed)
- ✅ **No browser dependency** - Runs in Node.js main process
- ✅ **Searchable** - Enables text-based queries

**Why not DOM scraping?**
The browser's PDF.js viewer uses **DOM virtualization** - only visible pages exist in the DOM. Attempting to query `.textLayer` elements for a 30-page PDF would only find 1-2 pages, causing incomplete extraction and "Script failed to execute" errors.

### Image Preview Strategy

**When**: Always generated for vision-capable models (currently first 3 pages)

**Processing**:
1. **Navigate PDF viewer to target page**: Use `PDFViewerApplication.page = N` to scroll to page
2. **Wait for render**: 120ms delay allows viewer to render the requested page
3. **Capture viewport screenshot**: `capturePage()` captures the visible PDF page
4. **Resize to LLM limits**: Resize to max 1568px (balances quality vs token cost)
5. **Repeat for N pages**: Default 3 pages, configurable via `maxPages` parameter

**Output Example**:
```typescript
[
  { data: "data:image/png;base64,...", mimeType: "image/png", page: 1 },
  { data: "data:image/png;base64,...", mimeType: "image/png", page: 2 },
  { data: "data:image/png;base64,...", mimeType: "image/png", page: 3 }
]
```

**Benefits**:
- Preserves visual fidelity (tables, charts, formatting)
- Multi-page support (not limited to first page)
- Page metadata (LLM knows which page it's viewing)
- Vision models excel at reading tables from images

## How PDFs Render in Electron

**Key Insight**: PDFs use HTML5 `<embed>` tag, which triggers browser's built-in PDF.js viewer:

```html
<embed src="file:///tmp/doc.pdf" type="application/pdf" />
```

**Rendering Behavior**:
- **One page visible at a time** (like Adobe Reader, not all pages stacked)
- **PDF.js provides JavaScript API**: `window.PDFViewerApplication` exposes viewer controls
- **Text layer DOM**: Searchable text rendered as overlaid `<span>` elements in `.textLayer` divs
- **Page navigation**: `PDFViewerApplication.page = N` scrolls to page N

**Screenshot Capture**:
- `view.webContents.capturePage()` captures only the **visible viewport**
- Typical page size: ~800×1000px at screen resolution
- After navigation to page N, wait 120ms for render before capturing

## Implementation Details

### Architecture

**Location**: `src/main/services/content-extractor.ts` (lines 170-386)

**Key Methods**:

```typescript
// Main entry point for PDF extraction
static async extractFromNoteTab(
  tabData: TabData,
  view?: WebContentsView
): Promise<ExtractedContent>

// Text extraction using pdfjs-dist (Node.js, no DOM dependency)
private static async extractPdfTextWithPdfjsLib(
  filePath: string
): Promise<PDFContent | undefined>

// Image preview capture (multi-page aware, uses WebContentsView)
private static async capturePdfPagePreviews(
  view: WebContentsView,
  maxPages = 3
): Promise<ImageDataPayload[]>
```

**Flow**:
```typescript
// 1. Resolve PDF file path
const pdfPath = resolvePdfPath(tabData);

// 2. Extract text using pdfjs-dist (reliable, direct from file)
const pdfContent = pdfPath ? await extractPdfTextWithPdfjsLib(pdfPath) : undefined;

// 3. Capture paginated previews (when view available)
const previews = view ? await capturePdfPagePreviews(view) : [];

// 4. Return hybrid content
return {
  type: 'pdf',
  content: pdfContent ?? '',
  imageData: previews[0],      // Primary preview (page 1)
  images: previews.slice(1),   // Additional pages (2-N)
  metadata: {
    numPages: pdfContent.numPages,
    previewPages: [1, 2, 3]
  }
};
```

### Type Definitions

**New Types** (`src/types.ts`):

```typescript
export interface PDFContent {
  text: string;       // Extracted text from all pages
  numPages: number;   // Total page count
  metadata?: Record<string, any>;
}

export interface ImageDataPayload {
  data: string;       // base64 data URL
  mimeType: string;   // 'image/png'
  page?: number;      // Page number for PDF previews
}

export interface ExtractedContent {
  type: 'html' | 'pdf' | 'text' | 'image';
  content: string | SerializedDOM | PDFContent;
  imageData?: ImageDataPayload | ImageDataPayload[];
  images?: ImageDataPayload[];  // Additional images for multi-page PDFs
  metadata?: {
    numPages?: number;
    previewPages?: number[];
  };
}
```

### Graceful Degradation

**Edge Cases Handled**:

1. **View unavailable** (session restore, load failure):
   - Fallback: Extract text from file path using offscreen window
   - No previews generated (text-only mode)

2. **Non-searchable PDF** (scanned documents):
   - Text extraction returns empty string
   - Previews still captured (vision models read scanned text)

3. **PDF.js not loaded**:
   - Wait up to 1.8 seconds (12 attempts × 150ms) for text layer
   - Timeout: Return best-effort data (may be partial)

4. **Page navigation failure**:
   - Continue with remaining pages (partial preview better than none)

## Integration with LLM Providers

**Message Construction** (`src/main/ipc/register-ipc-handlers.ts`):

PDFs are treated as multimodal content with both text and images:

```typescript
// 1. Collect all images from PDF content
const collectImagesFromContent = (content: ExtractedContent): ImageDataPayload[] => {
  const images: ImageDataPayload[] = [];
  if (content.imageData) {
    images.push(...(Array.isArray(content.imageData) ? content.imageData : [content.imageData]));
  }
  if (content.images) {
    images.push(...content.images);
  }
  return images;
};

// 2. Build multimodal message
const contentBlocks: ContentBlock[] = [];

// Add text context (includes PDF extracted text)
contentBlocks.push({
  type: 'text',
  text: `# PDF: ${pdfTitle}\n${pdfContent.text}`
});

// Add image previews
const pdfImages = collectImagesFromContent(pdfContent);
pdfImages.forEach(img => {
  contentBlocks.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimeType,
      data: img.data.split(',')[1]
    }
  });
});
```

**Provider Support**:
- ✅ **Anthropic (Claude 3.5 Sonnet)**: Excellent table reading, multi-image support
- ✅ **OpenAI (GPT-4V)**: Good visual understanding, supports multiple images
- ✅ **OpenRouter**: Routes to vision-capable models
- ✅ **Fireworks AI**: Vision models via API
- ⚠️ **Text-only models**: Receive extracted text, ignore images

## Performance Characteristics

### Token Costs

**Text extraction**:
- 1 page ≈ 500-1000 tokens (depending on density)
- 10-page PDF ≈ 5,000-10,000 tokens (~$0.01-0.03 with Claude Sonnet)

**Image previews** (3 pages):
- 1 preview (1568px) ≈ 750-1000 tokens
- 3 previews ≈ 2,250-3,000 tokens (~$0.02-0.06)

**Hybrid approach** (text + 3 images):
- Total: ~7,000-13,000 tokens for 10-page PDF
- Cost: ~$0.03-0.09 per query (Claude Sonnet rates)

### Extraction Speed

**Text extraction**:
- From view: ~200-500ms (wait for text layer + DOM query)
- From file: ~1-2 seconds (load offscreen + extract)

**Image previews** (3 pages):
- Page navigation: ~120ms per page
- Screenshot capture: ~50-100ms per page
- Resize: ~10-20ms per page
- **Total**: ~500-700ms for 3 pages

**Overall**: PDF extraction completes in ~1-2 seconds for typical documents

## Design Decisions & Rationale

### Why Hybrid (Text + Images)?

**Alternative 1**: Text-only extraction
- ❌ Tables become unreadable gibberish
- ❌ Charts and diagrams lost entirely
- ✅ Cheapest token cost

**Alternative 2**: Images-only (no text extraction)
- ❌ Higher token cost (images are 4x expensive)
- ❌ Text search not possible
- ✅ Perfect visual fidelity

**Chosen**: Hybrid approach
- ✅ Text enables search and cheap context
- ✅ Images preserve tables/charts for vision models
- ✅ Best of both worlds for modern use cases
- ⚠️ Slightly more complex implementation

### Why First 3 Pages (Not All)?

**Token budget**: 100-page PDF = 75,000-100,000 tokens in images alone
- Exceeds most model context windows
- Cost: $0.50-1.00+ per query

**User intent**: Most queries focus on specific sections
- Users can navigate to relevant page before querying
- Future: Add page selection UI for targeted extraction

**Performance**: Capturing 100 pages takes ~20-30 seconds
- Blocking user interaction
- Wastes resources for unused pages

**Configurable**: `maxPages` parameter allows adjustment
```typescript
const previews = await capturePdfPagePreviews(view, maxPages: 5);
```

### Why 1568px Preview Size?

**LLM image limits**:
- Claude: 1568px max dimension (automatic resize if exceeded)
- GPT-4V: Similar limits for optimal processing
- Larger images don't improve accuracy (models resize anyway)

**Token efficiency**:
- 1568px ≈ 750-1000 tokens
- 800px ≈ 400-500 tokens (but text becomes unreadable)
- Balance: Readable tables at reasonable cost

### Why Wait 120ms After Page Navigation?

**PDF.js render timing**:
- Page navigation triggers async re-render
- Viewer needs time to:
  1. Unload current page canvas
  2. Request new page from PDF document
  3. Render text layer and canvas
  4. Apply zoom/fit settings

**Testing results**:
- 50ms: Sometimes captures blank/partial page
- 120ms: Consistently captures fully rendered page
- 200ms: No accuracy improvement, just slower

**Trade-off**: Slight delay ensures correctness

## Future Enhancements

### Planned Improvements

1. **Page selection UI**:
   - Let users choose which pages to include
   - "Extract pages 5-8" in query options
   - Thumbnail grid for visual selection

2. **Adaptive preview count**:
   - Short PDFs (1-5 pages): Capture all
   - Medium PDFs (6-20 pages): Capture first 5
   - Long PDFs (20+ pages): Capture first 3 + user selection

3. **OCR for scanned PDFs**:
   - Detect image-based PDFs (no text layer)
   - Run Tesseract OCR on previews
   - Combine OCR text with visual previews

4. **Table-specific extraction**:
   - Detect tables in PDF structure
   - Extract table data as CSV/Markdown
   - Send both visual and structured data

5. **Caching previews**:
   - Store rendered pages for recently opened PDFs
   - Avoid re-rendering on subsequent queries
   - Clear cache on PDF close

6. **Smart page selection**:
   - Analyze text content to find relevant sections
   - "Extract pages containing 'revenue data'"
   - Auto-select pages matching query keywords

### Performance Optimizations

1. **Parallel page capture**:
   - Navigate and capture multiple pages concurrently
   - Reduce 3-page extraction from 700ms → 300ms

2. **Lazy preview generation**:
   - Only generate previews when vision model selected
   - Skip for text-only models

3. **Progressive rendering**:
   - Send page 1 immediately, stream remaining pages
   - Faster time-to-first-token for LLM response

## Testing Strategy

### Unit Tests
- ✅ PDF path resolution (file://, metadata.filePath)
- ✅ Text extraction from DOM (.textLayer parsing)
- ✅ Page count detection (PDFViewerApplication API)
- ✅ Image payload construction (page metadata)

### Integration Tests
- ✅ Multi-page PDF (3+ pages) → Verify 3 previews captured
- ✅ Scanned PDF (no text layer) → Verify empty text, images present
- ✅ View unavailable → Verify fallback to file extraction
- ✅ Page navigation → Verify correct page rendered

### Manual Testing Checklist
- [ ] Upload 10-page PDF → Verify 3 previews (pages 1-3)
- [ ] Query with vision model → Verify images sent
- [ ] Query with text-only model → Verify text sent, images skipped
- [ ] Session restore PDF tab → Verify extraction still works
- [ ] Scanned PDF → Verify vision model reads content
- [ ] Table-heavy PDF → Verify accurate table extraction

## Dependencies

### Runtime Dependencies

```json
{
  "pdfjs-dist": "^5.4.449"
}
```

**Why pdfjs-dist?**
- ✅ **Industry standard** - Same library used by Firefox and Chrome PDF viewers
- ✅ **Battle-tested** - Used by millions of websites and applications
- ✅ **Node.js compatible** - Runs in main process without browser dependency
- ✅ **No DOM virtualization** - Direct access to PDF data model (all pages available)
- ✅ **Active maintenance** - Regular updates from Mozilla
- ✅ **Comprehensive API** - Text extraction, metadata, page rendering

**Usage in this project:**
```typescript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const loadingTask = pdfjsLib.getDocument(filePath);
const doc = await loadingTask.promise;
const page = await doc.getPage(pageNum);
const textContent = await page.getTextContent();
```

## Related Documents

- [Design Doc 09: Smart Content Extraction](./09-smart-content-extraction.md) - Web page extraction (Article vs App routing)
- [Design Doc 03: Flexible Tab System](./03-flexible-tab-system.md) - Tab architecture for PDFs, images, notes
- [Design Doc 04: User Experience and Context Management](./04-user-experience-and-context-management.md) - Multi-source context design

## References

- [pdfjs-dist npm package](https://www.npmjs.com/package/pdfjs-dist) - Official PDF.js library for Node.js
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/) - API reference and guides
- [Electron capturePage](https://www.electronjs.org/docs/latest/api/web-contents#contentsCapturePage) - Screenshot capture API
- [Anthropic Vision](https://docs.anthropic.com/en/docs/vision) - Claude vision capabilities
- [OpenAI Vision](https://platform.openai.com/docs/guides/vision) - GPT-4V vision guide
