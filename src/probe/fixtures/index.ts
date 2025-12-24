/**
 * Probe Fixtures - Minimal test files for capability probing
 *
 * These are tiny, pre-encoded fixtures designed to minimize API costs
 * while still effectively testing model capabilities.
 */

/**
 * 56x56 red PNG (121 bytes). Meets Qwen VL minimum requirements (56x56).
 */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAIAAAAn5KxJAAAAQElEQVR42u3OQQkAAAgAsetfWh+mEAYLsKZeSFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRU9CwicjR1t9nCvQAAAABJRU5ErkJggg==';

export const TINY_PNG_MIME_TYPE = 'image/png';

/**
 * Minimal 8x8 red PNG image (more visible for debugging)
 */
export const SMALL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAADklEQVQI12P4z8DAwMAAAA' +
  'QCAP/0jAqPAAAAAElFTkSuQmCC';

/**
 * Minimal valid PDF (contains "Hello" text) - approximately 200 bytes
 * This is a valid PDF 1.4 document with minimal structure
 */
export const TINY_PDF_BASE64 = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 72 72]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
175
%%EOF`
).toString('base64');

export const TINY_PDF_MIME_TYPE = 'application/pdf';

/**
 * Get a data URL for the tiny PNG
 */
export function getTinyPngDataUrl(): string {
  return `data:${TINY_PNG_MIME_TYPE};base64,${TINY_PNG_BASE64}`;
}

/**
 * Get a data URL for the tiny PDF
 */
export function getTinyPdfDataUrl(): string {
  return `data:${TINY_PDF_MIME_TYPE};base64,${TINY_PDF_BASE64}`;
}

/**
 * Non-destructive probe prompts that won't trigger any harmful completions
 */
export const PROBE_PROMPTS = {
  text: 'Respond with just the word "OK" to confirm you received this message.',
  image: 'What color is this image? Reply with just the color name.',
  pdf: 'This is a test PDF. Reply with just "OK" to confirm you can see it.',
  schema: 'Reply with just "OK".',
} as const;

/**
 * Get fixture stats for logging
 */
export function getFixtureStats(): {
  pngSizeBytes: number;
  pdfSizeBytes: number;
} {
  return {
    pngSizeBytes: Math.ceil((TINY_PNG_BASE64.length * 3) / 4),
    pdfSizeBytes: Math.ceil((TINY_PDF_BASE64.length * 3) / 4),
  };
}
