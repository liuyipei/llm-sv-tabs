# Content Normalization UI Experiment

**Status:** 🧪 Experimental
**Purpose:** Iterate on content normalization pipelines before integrating into main app

---

## Overview

This is a standalone experiment for testing and iterating on the content normalization UI. It runs separately from the main Electron browser, allowing rapid iteration on:

- **Pipeline visualization**: See artifacts flow through Capture → Render → Extract stages
- **Format conversions**: Test PDF→Image, Image→Text, Webpage→PDF pipelines
- **LLM extraction**: Use remote LLMs to extract/describe content from images and PDFs
- **Selection UX**: Experiment with how users select context for model queries

## Quick Start

```bash
# From the experiments/content-normalization-ui directory
npm install
npm run dev

# Opens at http://localhost:5174
```

## Architecture

```
experiments/content-normalization-ui/
├── README.md              # This file
├── package.json           # Standalone dependencies
├── vite.config.ts         # Vite configuration
├── index.html             # Entry point
├── src/
│   ├── main.ts            # App initialization
│   ├── App.svelte         # Main layout
│   ├── lib/
│   │   ├── types.ts       # Re-exports from main app types
│   │   ├── mock-data.ts   # Sample pipelines for testing
│   │   ├── converters/    # Format conversion utilities
│   │   │   ├── pdf-to-image.ts
│   │   │   ├── image-to-text.ts
│   │   │   └── llm-extract.ts
│   │   └── stores/        # Experiment-specific stores
│   │       └── experiment.ts
│   ├── components/
│   │   ├── SourceUploader.svelte    # Upload PDFs, images, paste URLs
│   │   ├── PipelineView.svelte      # Main pipeline visualization
│   │   ├── StagePanel.svelte        # Individual stage artifacts
│   │   ├── ConversionPanel.svelte   # Run conversions
│   │   ├── LLMExtractPanel.svelte   # LLM-based extraction
│   │   └── ContextPreview.svelte    # Preview what would go to model
│   └── samples/           # Sample files for testing
│       ├── sample.pdf
│       └── sample-image.png
└── tsconfig.json
```

## Features

### 1. Source Upload

Upload or paste content to create pipelines:
- **PDF files**: Drag & drop or file picker
- **Images**: PNG, JPEG, WebP support
- **URLs**: Paste webpage URLs (fetched via proxy or screenshot)
- **Text/Markdown**: Paste raw text content

### 2. Pipeline Visualization

See the full extraction pipeline:
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CAPTURE   │ → │   RENDER    │ → │   EXTRACT   │
│             │    │             │    │             │
│ Original    │    │ Normalized  │    │ Derived     │
│ content     │    │ visual      │    │ text        │
└─────────────┘    └─────────────┘    └─────────────┘
```

Each stage shows:
- Artifact previews (images, text snippets)
- Metadata (dimensions, token counts, quality)
- Provenance (what method produced this)
- Actions (regenerate, compare, select)

### 3. Format Conversions

Test different conversion paths:

| From | To | Method |
|------|-----|--------|
| PDF | Images | pdf.js rasterization |
| Webpage | PDF | Print to PDF |
| Webpage | Screenshot | Puppeteer/Playwright |
| Image | Text | Tesseract OCR |
| Image | Text | Vision LLM |
| PDF | Text | pdf.js text layer |

### 4. LLM Extraction

Use remote LLMs to extract content:

```typescript
// Example: Ask GPT-4o to describe a PDF page
const result = await llmExtract({
  image: pageImageBase64,
  prompt: "Extract all text from this document page. Preserve formatting.",
  model: "gpt-4o"
});
```

Supported providers:
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude 3.5 Sonnet)
- Ollama (local models with vision)

### 5. Context Preview

See exactly what would be sent to the model:
- Text chunks with anchors
- Image attachments with dimensions
- Token count estimates
- Format toggle (rendered vs raw)

## Conversion Capabilities

### Local (No API Required)

1. **PDF → Images**
   - Uses pdf.js for client-side rendering
   - Configurable DPI (72, 150, 300)
   - PNG or JPEG output

2. **PDF → Text**
   - pdf.js text layer extraction
   - Preserves page structure
   - Quality hints based on text density

3. **Image → Text (OCR)**
   - Tesseract.js for client-side OCR
   - Language detection
   - Confidence scores

### Remote (Requires API Key)

1. **Image → Text (Vision LLM)**
   - Send image to vision model
   - Custom extraction prompts
   - Structured output support

2. **Webpage → Description**
   - Screenshot page
   - Ask LLM to describe/summarize
   - Extract specific elements

3. **PDF → Summary**
   - Render pages as images
   - Chain LLM calls for multi-page docs
   - Synthesize overall summary

## Configuration

Create `.env` in the experiment directory:

```env
# Optional: For LLM extraction features
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434
```

## Development

### Adding a New Converter

```typescript
// src/lib/converters/my-converter.ts
import type { CaptureArtifact, ExtractArtifact } from '../types';

export interface MyConverterOptions {
  // ...
}

export async function myConvert(
  input: CaptureArtifact,
  options: MyConverterOptions
): Promise<ExtractArtifact> {
  // Implementation
}
```

### Adding Sample Data

Add test files to `src/samples/` and register in `src/lib/mock-data.ts`:

```typescript
export const SAMPLE_SOURCES = [
  {
    name: 'My Sample PDF',
    type: 'pdf',
    path: '/samples/my-sample.pdf'
  }
];
```

## Testing Scenarios

### Scenario 1: PDF Document Pipeline

1. Upload a PDF
2. See capture artifact (original bytes)
3. Click "Render Pages" → see rasterized images
4. Click "Extract Text" → compare text layer vs OCR vs LLM
5. Select best extraction for context

### Scenario 2: Webpage Capture

1. Paste URL
2. Choose capture method (screenshot vs DOM)
3. Compare extraction methods (Readability vs DOM walker vs LLM)
4. Preview context output

### Scenario 3: Mixed Source Context

1. Upload PDF + paste URL + add note
2. See all three pipelines
3. Select artifacts from each
4. Preview combined context
5. Estimate total tokens

## Relationship to Main App

This experiment uses types from the main app:
- `src/types/pipeline.ts` → Pipeline types
- `src/types/context-ir.ts` → Context IR types

Successful patterns from this experiment will be integrated into:
- `src/main/services/pipeline/` → Backend services
- `src/ui/components/artifacts/` → UI components
- `src/ui/stores/pipeline.ts` → State management

## Known Limitations

- No Electron APIs (runs in browser only)
- PDF rendering uses pdf.js (not native)
- Webpage capture requires CORS-friendly URLs or proxy
- File system access limited to uploads

## Next Steps

After experimentation:
1. Port successful UX patterns to main app
2. Integrate with Electron for native capabilities
3. Wire up IPC handlers
4. Add to tab context menu
