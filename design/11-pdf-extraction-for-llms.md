# Design Document 11: PDF Extraction for LLMs

## Overview

PDF extraction combines text extraction (via `pdfjs-dist`) with paginated image previews (via `WebContentsView` screenshots) for vision-capable models.

## Problem Statement

PDFs contain text and visual content requiring different extraction strategies. The browser's PDF.js viewer uses DOM virtualization—only visible pages exist in the DOM. Querying `.textLayer` on a 30-page PDF returns 1-2 pages, causing "Script failed to execute" errors.

## Solution

### Text Extraction (pdfjs-dist in Node.js)

```typescript
const loadingTask = pdfjsLib.getDocument(filePath);
const doc = await loadingTask.promise;
const pages: string[] = [];

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map(item => item.str).join(' ');
  pages.push(pageText);
}

return { text: pages.join('\n\n'), numPages: doc.numPages };
```

### Image Previews (WebContentsView screenshots)

Captures first 3 pages by navigating PDF viewer (`PDFViewerApplication.page = N`), waiting 120ms, then calling `capturePage()`. Resizes to 1568px.

## Implementation

**Location**: `src/main/services/content-extractor.ts`

```typescript
static async extractFromNoteTab(tabData: TabData, view?: WebContentsView): Promise<ExtractedContent> {
  const pdfPath = resolvePdfPath(tabData);
  const pdfContent = pdfPath ? await extractPdfTextWithPdfjsLib(pdfPath) : undefined;
  const previews = view ? await capturePdfPagePreviews(view) : [];

  return {
    type: 'pdf',
    content: pdfContent ?? '',
    imageData: previews[0],
    images: previews.slice(1),
  };
}
```

## Type Definitions

```typescript
export interface PDFContent {
  text: string;
  numPages: number;
}

export interface ImageDataPayload {
  data: string;       // base64 data URL
  mimeType: string;
  page?: number;
}
```

## Dependencies

```json
{
  "pdfjs-dist": "^5.4.449"
}
```

**Usage**:
```typescript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
```

## References

- [pdfjs-dist npm package](https://www.npmjs.com/package/pdfjs-dist)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
