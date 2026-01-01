/**
 * Extract Service
 *
 * Handles the extract stage of the pipeline.
 * Derives text content from captured/rendered content.
 *
 * This is a placeholder implementation - real implementation would
 * integrate with Readability, OCR, Vision models, etc.
 */

import type { Anchor, QualityHint } from '../../../types/context-ir';
import type {
  ExtractArtifact,
  PageText,
  RenderArtifact,
  CaptureArtifact,
} from '../../../types/pipeline';
import { createArtifactId } from '../../../types/pipeline';
import type { ExtractConfig, ExtractInput, StageResult } from './types';

/**
 * Extract Service
 *
 * Extracts text from various content types.
 */
export class ExtractService {
  /**
   * Extract text from captured/rendered content
   */
  async extractText(
    input: ExtractInput,
    sourceAnchor: Anchor
  ): Promise<StageResult<ExtractArtifact>> {
    const startTime = Date.now();

    try {
      const artifact = await this.performExtraction(input, sourceAnchor, startTime);

      return {
        success: true,
        artifacts: [artifact],
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        artifacts: [],
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Perform the actual extraction
   */
  private async performExtraction(
    input: ExtractInput,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    const { parent, config } = input;

    switch (config.type) {
      case 'readability':
        return this.extractWithReadability(parent, config, sourceAnchor, startTime);

      case 'dom_walker':
        return this.extractWithDomWalker(parent, config, sourceAnchor, startTime);

      case 'text_layer':
        return this.extractTextLayer(parent, config, sourceAnchor, startTime);

      case 'ocr':
        return this.extractWithOcr(parent, config, sourceAnchor, startTime);

      case 'vision':
        return this.extractWithVision(parent, config, sourceAnchor, startTime);

      default:
        throw new Error(`Unsupported extraction type: ${config.type}`);
    }
  }

  /**
   * Extract using Mozilla Readability (for articles)
   */
  private async extractWithReadability(
    parent: RenderArtifact | CaptureArtifact,
    config: ExtractConfig,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    // Placeholder: In real implementation, this would:
    // 1. Get HTML content from capture
    // 2. Run Readability to extract article
    // 3. Convert to Markdown

    await new Promise((resolve) => setTimeout(resolve, 50));

    const text = `# Article Title

This is placeholder text extracted using Readability.

In the real implementation, this would be the clean article content
with proper markdown formatting, headings, paragraphs, and links.`;

    const quality = this.assessQuality(text);

    return {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: sourceAnchor,
      created_at: Date.now(),
      provenance: {
        method: 'readability',
        version: '1.0.0',
        parent_ids: [parent.artifact_id],
        config: {
          includeLinks: config.includeLinks ?? true,
        },
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'readability',
      text,
      quality,
      token_estimate: this.estimateTokens(text),
      char_count: text.length,
    };
  }

  /**
   * Extract using DOM walker (for apps/complex pages)
   */
  private async extractWithDomWalker(
    parent: RenderArtifact | CaptureArtifact,
    config: ExtractConfig,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    // Placeholder: In real implementation, this would:
    // 1. Walk DOM structure
    // 2. Extract semantic content (headings, buttons, forms, etc.)
    // 3. Preserve structure in simplified HTML or Markdown

    await new Promise((resolve) => setTimeout(resolve, 50));

    const text = `## App Structure

### Navigation
- Home
- Products
- About

### Main Content
Placeholder content extracted from app DOM structure.

### Footer
Copyright 2025`;

    const quality = this.assessQuality(text);

    return {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: sourceAnchor,
      created_at: Date.now(),
      provenance: {
        method: 'dom_walker',
        version: '1.0.0',
        parent_ids: [parent.artifact_id],
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'dom_walker',
      text,
      quality,
      token_estimate: this.estimateTokens(text),
      char_count: text.length,
    };
  }

  /**
   * Extract text layer from PDF
   */
  private async extractTextLayer(
    parent: RenderArtifact | CaptureArtifact,
    config: ExtractConfig,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    // Placeholder: In real implementation, this would:
    // 1. Use pdf.js to extract text layer
    // 2. Preserve page structure
    // 3. Handle multi-column layouts

    await new Promise((resolve) => setTimeout(resolve, 100));

    const pageTexts: PageText[] = [];
    let fullText = '';

    // Would iterate over actual PDF pages
    const pageCount = parent.stage === 'render' ? (parent as RenderArtifact).page_count : 1;

    for (let i = 1; i <= pageCount; i++) {
      const pageText = `Page ${i} content placeholder.

This would be the actual text extracted from the PDF text layer.`;

      pageTexts.push({
        page_number: i,
        text: pageText,
        quality: this.assessQuality(pageText),
        anchor: `${sourceAnchor}#p=${i}` as Anchor,
        char_count: pageText.length,
      });

      fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
    }

    const quality = this.assessQuality(fullText);

    return {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: sourceAnchor,
      created_at: Date.now(),
      provenance: {
        method: 'pdf_text_layer',
        version: '1.0.0',
        parent_ids: [parent.artifact_id],
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'text_layer',
      text: fullText.trim(),
      quality,
      token_estimate: this.estimateTokens(fullText),
      char_count: fullText.length,
      page_texts: pageTexts,
    };
  }

  /**
   * Extract using OCR
   */
  private async extractWithOcr(
    parent: RenderArtifact | CaptureArtifact,
    config: ExtractConfig,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    // Placeholder: In real implementation, this would:
    // 1. Run Tesseract or similar OCR
    // 2. Handle multiple pages
    // 3. Apply language hints

    await new Promise((resolve) => setTimeout(resolve, 200));

    const text = `OCR-extracted text placeholder.

This would be the actual text recognized from images.
OCR quality can vary based on:
- Image quality
- Font types
- Document layout`;

    // OCR often produces lower quality text
    const quality: QualityHint = 'ocr_like';

    return {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: sourceAnchor,
      created_at: Date.now(),
      provenance: {
        method: 'tesseract_ocr',
        version: '1.0.0',
        parent_ids: [parent.artifact_id],
        config: {
          languages: config.languages ?? ['en'],
        },
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'ocr',
      text,
      quality,
      token_estimate: this.estimateTokens(text),
      char_count: text.length,
    };
  }

  /**
   * Extract using Vision model
   */
  private async extractWithVision(
    parent: RenderArtifact | CaptureArtifact,
    config: ExtractConfig,
    sourceAnchor: Anchor,
    startTime: number
  ): Promise<ExtractArtifact> {
    // Placeholder: In real implementation, this would:
    // 1. Send image(s) to vision model
    // 2. Request text extraction/description
    // 3. Handle structured outputs

    await new Promise((resolve) => setTimeout(resolve, 500));

    const text = `# Vision Model Extraction

This document appears to contain:

## Main Content
A placeholder for content that would be described by the vision model.

## Visual Elements
- Images and graphics
- Tables and charts
- Handwritten notes

The vision model provides high-quality extraction for complex layouts
that are difficult for traditional OCR.`;

    const quality = this.assessQuality(text);

    return {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: sourceAnchor,
      created_at: Date.now(),
      provenance: {
        method: 'vision_extraction',
        version: '1.0.0',
        parent_ids: [parent.artifact_id],
        config: {
          model: config.visionModel ?? 'gpt-4o',
        },
        duration_ms: Date.now() - startTime,
      },
      selected: false,
      extract_type: 'vision',
      text,
      quality,
      token_estimate: this.estimateTokens(text),
      char_count: text.length,
    };
  }

  /**
   * Assess text quality using heuristics
   */
  private assessQuality(text: string): QualityHint {
    if (!text || text.length === 0) return 'low';

    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return 'low';

    // Calculate average chars per line
    const avgCharsPerLine = text.length / lines.length;

    // Count non-ASCII characters
    const nonAsciiCount = (text.match(/[^\x00-\x7F]/g) || []).length;
    const nonAsciiRatio = nonAsciiCount / text.length;

    // Check for OCR patterns (single char words, unusual spacing)
    const words = text.split(/\s+/);
    const singleCharWords = words.filter((w) => w.length === 1).length;
    const singleCharRatio = singleCharWords / words.length;

    if (singleCharRatio > 0.2) return 'ocr_like';
    if (nonAsciiRatio > 0.2) return 'low';
    if (nonAsciiRatio > 0.05 || avgCharsPerLine < 30) return 'mixed';
    if (avgCharsPerLine > 50) return 'good';

    return 'mixed';
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}
