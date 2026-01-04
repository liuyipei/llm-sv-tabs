/**
 * Mock Data for Experiment
 *
 * Sample pipelines and artifacts for testing the UI without real conversions.
 */

import type {
  SourcePipeline,
  SourceId,
  CaptureArtifact,
  RenderArtifact,
  ExtractArtifact,
  BinaryBlob,
  Anchor,
} from './types';
import { createEmptyPipeline, createArtifactId } from './types';

/**
 * Sample sources that can be loaded
 */
export const SAMPLE_SOURCES = [
  {
    id: 'sample-pdf',
    name: 'Sample PDF Document',
    type: 'pdf' as const,
    description: 'A multi-page PDF for testing extraction',
  },
  {
    id: 'sample-webpage',
    name: 'Sample Article',
    type: 'url' as const,
    url: 'https://example.com/article',
    description: 'A sample article webpage',
  },
  {
    id: 'sample-image',
    name: 'Sample Screenshot',
    type: 'image' as const,
    description: 'A screenshot for OCR testing',
  },
];

/**
 * Create a placeholder binary blob
 */
function createPlaceholderBlob(mimeType: string, description: string): BinaryBlob {
  // Create a simple placeholder SVG as base64
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <rect fill="#21262d" width="200" height="150"/>
    <text x="100" y="75" text-anchor="middle" fill="#8b949e" font-family="sans-serif" font-size="12">${description}</text>
  </svg>`;

  return {
    data: btoa(svg),
    mime_type: mimeType.includes('svg') ? 'image/svg+xml' : mimeType,
    byte_size: svg.length,
  };
}

/**
 * Create a mock capture artifact
 */
export function createMockCaptureArtifact(
  sourceId: SourceId,
  type: 'screenshot' | 'pdf_bytes' | 'text' = 'text'
): CaptureArtifact {
  const base = {
    artifact_id: createArtifactId(),
    stage: 'capture' as const,
    source_anchor: sourceId as Anchor,
    created_at: Date.now(),
    provenance: {
      method: type === 'screenshot' ? 'browser_screenshot' :
              type === 'pdf_bytes' ? 'file_upload' : 'text_capture',
      version: '1.0.0',
      parent_ids: [],
      duration_ms: Math.floor(Math.random() * 500) + 100,
    },
    selected: false,
    source_uri: 'https://example.com',
  };

  if (type === 'screenshot') {
    return {
      ...base,
      capture_type: 'screenshot',
      data: createPlaceholderBlob('image/png', 'Screenshot'),
      mime_type: 'image/png',
      dimensions: { width: 1920, height: 1080 },
    };
  }

  if (type === 'pdf_bytes') {
    return {
      ...base,
      capture_type: 'pdf_bytes',
      data: createPlaceholderBlob('application/pdf', 'PDF'),
      mime_type: 'application/pdf',
    };
  }

  return {
    ...base,
    capture_type: 'text',
    data: `# Sample Document

This is sample text content captured from the source.

## Section 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua.

## Section 2

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
aliquip ex ea commodo consequat.`,
    mime_type: 'text/markdown',
  };
}

/**
 * Create a mock render artifact
 */
export function createMockRenderArtifact(
  sourceId: SourceId,
  parentId: string,
  pageCount: number = 3
): RenderArtifact {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    page_number: i + 1,
    image: createPlaceholderBlob('image/png', `Page ${i + 1}`),
    anchor: `${sourceId}#p=${i + 1}` as Anchor,
    dimensions: { width: 612, height: 792 },
  }));

  return {
    artifact_id: createArtifactId(),
    stage: 'render',
    source_anchor: sourceId as Anchor,
    created_at: Date.now(),
    provenance: {
      method: 'pdfjs_rasterize',
      version: '4.0.379',
      parent_ids: [parentId],
      duration_ms: Math.floor(Math.random() * 1000) + 500,
      config: { dpi: 150, format: 'png' },
    },
    selected: false,
    render_type: 'rasterized_pages',
    pages,
    render_config: {
      dpi: 150,
      format: 'png',
    },
    page_count: pageCount,
  };
}

/**
 * Create a mock extract artifact
 */
export function createMockExtractArtifact(
  sourceId: SourceId,
  parentId: string,
  method: 'text_layer' | 'ocr' | 'vision' | 'readability' = 'text_layer'
): ExtractArtifact {
  const texts: Record<string, string> = {
    text_layer: `# Document Title

This is text extracted from the PDF text layer.

## Chapter 1: Introduction

The quick brown fox jumps over the lazy dog. This sentence contains every
letter of the alphabet and is commonly used for font testing.

## Chapter 2: Methods

We employed a mixed-methods approach combining qualitative and quantitative
analysis to examine the research questions.

## Chapter 3: Results

Our findings indicate a significant correlation between the variables
studied (p < 0.05).`,

    ocr: `# Document Title

This is text extracted via OCR (Optical Character Recognition).

Note: OCR may contain some errors, especially with:
- Unusual fonts
- Low quality scans
- Complex layouts

## Detected Text

The quick brown fox jumps over the lazy dog.`,

    vision: `# AI-Extracted Content

This content was extracted using a vision language model.

## Document Description

The document appears to be a research paper with the following structure:
- Title and abstract
- Introduction section
- Methods section
- Results with figures
- Discussion and conclusion

## Key Points

1. The document discusses experimental methods
2. Contains several data tables
3. Includes charts and graphs`,

    readability: `# Article Title

This is the main article content extracted using Readability.

The algorithm removes navigation, ads, and other non-content elements
to provide a clean reading experience.

## Main Content

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
tempor incididunt ut labore et dolore magna aliqua.`,
  };

  const text = texts[method];
  const quality = method === 'ocr' ? 'ocr_like' as const :
                  method === 'vision' ? 'good' as const : 'good' as const;

  return {
    artifact_id: createArtifactId(),
    stage: 'extract',
    source_anchor: sourceId as Anchor,
    created_at: Date.now(),
    provenance: {
      method,
      version: '1.0.0',
      parent_ids: [parentId],
      duration_ms: method === 'vision' ? 2000 + Math.floor(Math.random() * 1000) :
                   method === 'ocr' ? 1000 + Math.floor(Math.random() * 500) :
                   Math.floor(Math.random() * 200) + 50,
    },
    selected: false,
    extract_type: method,
    text,
    quality,
    token_estimate: Math.ceil(text.length / 4),
    char_count: text.length,
  };
}

/**
 * Create a complete mock pipeline with all stages
 */
export function createMockPipeline(
  name: string,
  type: 'pdf' | 'webpage' | 'image' = 'pdf'
): SourcePipeline {
  const sourceId = `src:mock${Date.now().toString(16).slice(-8)}` as SourceId;

  const pipeline = createEmptyPipeline(sourceId, {
    title: name,
    type: type === 'pdf' ? 'pdf' : type === 'webpage' ? 'webpage' : 'image',
    url: type === 'webpage' ? 'https://example.com/article' : undefined,
  });

  // Add capture artifact
  const capture = createMockCaptureArtifact(
    sourceId,
    type === 'pdf' ? 'pdf_bytes' : type === 'image' ? 'screenshot' : 'text'
  );
  pipeline.stages.capture.push(capture);

  // Add render artifact
  const render = createMockRenderArtifact(sourceId, capture.artifact_id, 3);
  pipeline.stages.render.push(render);

  // Add multiple extract artifacts for comparison
  const extractTextLayer = createMockExtractArtifact(sourceId, render.artifact_id, 'text_layer');
  const extractOcr = createMockExtractArtifact(sourceId, render.artifact_id, 'ocr');
  const extractVision = createMockExtractArtifact(sourceId, render.artifact_id, 'vision');

  pipeline.stages.extract.push(extractTextLayer, extractOcr, extractVision);

  // Auto-select the best extraction
  pipeline.selection.artifact_ids.add(extractTextLayer.artifact_id);
  pipeline.selection.estimated_tokens = extractTextLayer.token_estimate;

  // Mark as complete
  pipeline.status = { state: 'complete', completed_at: Date.now() };

  return pipeline;
}

/**
 * Load sample pipelines for demo purposes
 */
export function loadSamplePipelines(): Map<SourceId, SourcePipeline> {
  const pipelines = new Map<SourceId, SourcePipeline>();

  const pdf = createMockPipeline('Research Paper.pdf', 'pdf');
  pipelines.set(pdf.source_id, pdf);

  const webpage = createMockPipeline('Tech Article', 'webpage');
  pipelines.set(webpage.source_id, webpage);

  const image = createMockPipeline('Screenshot.png', 'image');
  pipelines.set(image.source_id, image);

  return pipelines;
}
