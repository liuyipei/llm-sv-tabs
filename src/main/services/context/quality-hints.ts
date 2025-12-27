/**
 * Quality Hint Heuristics
 *
 * Assesses the quality of extracted text content using heuristics.
 * These hints help the system decide when to prefer images over text,
 * or when to warn users about potentially unreliable extractions.
 *
 * Quality levels:
 * - 'good': Clean, well-structured text
 * - 'mixed': Some issues but usable
 * - 'low': Sparse or garbled content
 * - 'ocr_like': Appears to be OCR output (common errors, unusual patterns)
 */

import type { QualityHint } from '../../../types/context-ir.js';

// ============================================================================
// Quality Assessment
// ============================================================================

/**
 * Assess the quality of extracted text content
 *
 * @param text - The text to assess
 * @returns A quality hint based on heuristic analysis
 */
export function assessQuality(text: string): QualityHint {
  if (!text || text.trim().length === 0) {
    return 'low';
  }

  const metrics = computeMetrics(text);

  // Check for low quality first (sparse or heavily garbled)
  if (isLowQuality(metrics)) {
    return 'low';
  }

  // Check for OCR patterns (requires multiple strong signals)
  if (isLikelyOcr(metrics)) {
    return 'ocr_like';
  }

  // Check for mixed quality (some issues)
  if (isMixedQuality(metrics)) {
    return 'mixed';
  }

  // Default to good
  return 'good';
}

// ============================================================================
// Metrics Computation
// ============================================================================

/**
 * Text quality metrics
 */
interface TextMetrics {
  /** Total character count */
  charCount: number;
  /** Total word count */
  wordCount: number;
  /** Number of lines */
  lineCount: number;
  /** Average characters per line */
  avgCharsPerLine: number;
  /** Average word length */
  avgWordLength: number;
  /** Percentage of non-ASCII characters (0-1) */
  nonAsciiRatio: number;
  /** Percentage of control characters (0-1) */
  controlCharRatio: number;
  /** Percentage of whitespace (0-1) */
  whitespaceRatio: number;
  /** Number of single-character words */
  singleCharWords: number;
  /** Ratio of single-char words to total words (0-1) */
  singleCharWordRatio: number;
  /** Number of repeated character sequences */
  repeatedSequences: number;
  /** Common OCR error patterns found */
  ocrErrorPatterns: number;
}

/**
 * Compute quality metrics for text
 */
function computeMetrics(text: string): TextMetrics {
  const charCount = text.length;
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const lineCount = Math.max(lines.length, 1);
  const avgCharsPerLine = charCount / lineCount;

  // Word analysis
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const totalWordChars = words.reduce((sum, w) => sum + w.length, 0);
  const avgWordLength = wordCount > 0 ? totalWordChars / wordCount : 0;

  // Single character words (excluding common ones like "a", "I")
  const commonSingleCharWords = new Set(['a', 'i', 'o']);
  const singleCharWords = words.filter(
    (w) => w.length === 1 && !commonSingleCharWords.has(w.toLowerCase())
  ).length;
  const singleCharWordRatio = wordCount > 0 ? singleCharWords / wordCount : 0;

  // Character type analysis
  let nonAsciiCount = 0;
  let controlCharCount = 0;
  let whitespaceCount = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 127) {
      nonAsciiCount++;
    }
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      controlCharCount++;
    }
    if (/\s/.test(char)) {
      whitespaceCount++;
    }
  }

  const nonAsciiRatio = charCount > 0 ? nonAsciiCount / charCount : 0;
  const controlCharRatio = charCount > 0 ? controlCharCount / charCount : 0;
  const whitespaceRatio = charCount > 0 ? whitespaceCount / charCount : 0;

  // Repeated sequences (like "aaaa" or ".......")
  const repeatedSequences = countRepeatedSequences(text);

  // OCR error patterns
  const ocrErrorPatterns = countOcrErrorPatterns(text);

  return {
    charCount,
    wordCount,
    lineCount,
    avgCharsPerLine,
    avgWordLength,
    nonAsciiRatio,
    controlCharRatio,
    whitespaceRatio,
    singleCharWords,
    singleCharWordRatio,
    repeatedSequences,
    ocrErrorPatterns,
  };
}

// ============================================================================
// Quality Classification
// ============================================================================

/**
 * Check if text appears to be OCR output
 */
function isLikelyOcr(metrics: TextMetrics): boolean {
  // Very high single-char word ratio (OCR often breaks words)
  // But require minimum word count to avoid false positives on short text
  if (metrics.singleCharWordRatio > 0.25 && metrics.wordCount > 20) {
    return true;
  }

  // Very many OCR error patterns (needs strong signal)
  if (metrics.ocrErrorPatterns > 10 && metrics.wordCount > 10) {
    return true;
  }

  // Very short average word length combined with other signals
  // Requires multiple conditions to avoid false positives
  if (
    metrics.avgWordLength < 2 &&
    metrics.singleCharWordRatio > 0.2 &&
    metrics.ocrErrorPatterns > 5 &&
    metrics.wordCount > 20
  ) {
    return true;
  }

  return false;
}

/**
 * Check if text is low quality
 */
function isLowQuality(metrics: TextMetrics): boolean {
  // Very sparse content
  if (metrics.whitespaceRatio > 0.7) {
    return true;
  }

  // High control character ratio
  if (metrics.controlCharRatio > 0.05) {
    return true;
  }

  // High non-ASCII ratio (likely encoding issues)
  if (metrics.nonAsciiRatio > 0.2) {
    return true;
  }

  // Very short average word length
  if (metrics.avgWordLength < 2.5 && metrics.wordCount > 10) {
    return true;
  }

  // Too few words for the character count (fragmented text)
  if (metrics.charCount > 100 && metrics.wordCount < 5) {
    return true;
  }

  return false;
}

/**
 * Check if text is mixed quality
 */
function isMixedQuality(metrics: TextMetrics): boolean {
  // Moderate non-ASCII ratio (but not too much, which would be low)
  if (metrics.nonAsciiRatio > 0.05 && metrics.nonAsciiRatio <= 0.2) {
    return true;
  }

  // Some control characters
  if (metrics.controlCharRatio > 0.01 && metrics.controlCharRatio <= 0.05) {
    return true;
  }

  // Very short average line length (may indicate formatting issues)
  // More conservative threshold and requires more lines
  if (metrics.avgCharsPerLine < 25 && metrics.lineCount > 20) {
    return true;
  }

  // Some repeated sequences (may indicate extraction artifacts)
  if (metrics.repeatedSequences > 5) {
    return true;
  }

  // Some OCR-like patterns (conservative threshold)
  if (metrics.ocrErrorPatterns > 5 && metrics.ocrErrorPatterns <= 10) {
    return true;
  }

  return false;
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Count repeated character sequences (like "aaaa" or ".......")
 */
function countRepeatedSequences(text: string): number {
  // Match 4+ repeated characters
  const pattern = /(.)\1{3,}/g;
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Common OCR error patterns
 *
 * These patterns are designed to be specific to OCR errors
 * and avoid false positives on normal text.
 */
const OCR_ERROR_PATTERNS: RegExp[] = [
  // Character substitutions at word boundaries (more specific)
  /\bl1\b/gi, // "l1" as OCR confusion
  /\b0O\b/gi, // "0O" as OCR confusion
  /\bO0\b/gi, // "O0" as OCR confusion
  /\b1l\b/gi, // "1l" as OCR confusion
  /[|](?=[a-z])/gi, // pipe followed by letter (common OCR artifact)

  // Unusual character sequences (very specific)
  /[^\w\s.,!?:;'"()-]{4,}/g, // 4+ consecutive non-punctuation special chars
];

/**
 * Count OCR-like error patterns in text
 */
function countOcrErrorPatterns(text: string): number {
  let count = 0;
  for (const pattern of OCR_ERROR_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Get a human-readable description of a quality hint
 */
export function describeQuality(quality: QualityHint): string {
  switch (quality) {
    case 'good':
      return 'Good quality - clean, well-structured text';
    case 'mixed':
      return 'Mixed quality - some formatting issues or minor artifacts';
    case 'low':
      return 'Low quality - sparse or garbled content';
    case 'ocr_like':
      return 'OCR-like quality - appears to be optical character recognition output';
  }
}

/**
 * Check if quality is good enough for text-only models
 *
 * For text-only models, we want to warn or fall back to alternatives
 * when quality is low or OCR-like.
 */
export function isQualitySufficientForText(quality: QualityHint): boolean {
  return quality === 'good' || quality === 'mixed';
}
