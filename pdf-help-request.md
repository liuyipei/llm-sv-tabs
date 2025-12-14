# PDF Extraction Help Request

## Requirements Summary

### What We're Building
An Electron-based note-taking application that sends PDF content to LLMs (Claude, GPT-4, etc.) for analysis and question-answering.

### Core Requirements
1. **Extract text from PDF files** to send as context to LLMs
2. **Capture visual representation** (screenshots) for vision models to read tables/diagrams
3. **Handle multi-page PDFs** reliably (all pages, not just visible ones)
4. **Work in Electron's main process** using Node.js APIs
5. **Avoid DOM-based extraction** due to PDF.js DOM virtualization issues

### Technical Constraints
- Running in Electron 39 with Node.js 22
- PDFs displayed via `<embed>` tags in WebContentsView
- Cannot rely on DOM scraping because PDF.js only renders visible pages in DOM
- Need server-side extraction approach that works with file paths

### Current Implementation
- Using `pdfjs-dist` library (version 5.4.449)
- Importing from `pdfjs-dist/legacy/build/pdf.mjs`
- Image capture via `WebContentsView.capturePage()`

### Current Problem
When extracting a 3-page PDF:
- Query gets stuck on "Streaming" status indefinitely
- No token counts appear in the UI
- No error messages or console logs
- Suggests extraction is hanging or returning malformed content

---

## Help Request Prompt

**Repository:** `liuyipei/llm-sv-tabs`
**Branch to review:** `main`
**Context:** See `design/11-pdf-extraction-for-llms.md` for background

### The Ask

We need help debugging PDF text extraction in our Electron app. Our implementation uses `pdfjs-dist` to extract text from PDFs before sending to LLMs, but extraction appears to hang or fail silently.

**The Problem:**
- 3-page PDF extraction causes LLM query to hang on "Streaming"
- No token counts appear (suggesting no content sent to LLM)
- No errors logged, no exceptions thrown
- The extraction function appears to never complete or returns malformed data

**What We've Tried:**
1. Initially used DOM-based extraction (`.textLayer` querying) - failed due to PDF.js DOM virtualization
2. Switched to `pdfjs-dist` library to extract from PDF data model directly
3. Added defensive error handling for navigation failures
4. Verified imports use `pdfjs-dist/legacy/build/pdf.mjs` for ESM compatibility

**Code Location:**
- Main extraction logic: `src/main/services/content-extractor.ts`
- IPC handler: `src/main/ipc/register-ipc-handlers.ts`
- Design rationale: `design/11-pdf-extraction-for-llms.md`

**Specific Questions:**
1. Are there known issues with `pdfjs-dist` hanging in Electron's main process?
2. Should we use a different import path or initialization for Node.js environments?
3. Is there a better approach for server-side PDF text extraction in Electron?
4. Could file path handling (vs Buffer) cause silent failures?

**Environment:**
- Electron 39
- Node.js 22
- TypeScript
- `pdfjs-dist` 5.4.449

Any insights into why `getDocument()` or `getTextContent()` might hang silently would be greatly appreciated.
