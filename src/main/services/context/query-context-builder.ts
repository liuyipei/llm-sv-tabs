/**
 * Query Context Builder
 *
 * Integration layer between the existing query-handlers and the new Context IR system.
 * Provides a bridge to gradually adopt the new context representation.
 *
 * Usage in query-handlers.ts:
 *
 * ```typescript
 * import { buildQueryContext, QueryContextResult } from './context/query-context-builder';
 *
 * // Inside send-query handler:
 * const contextResult = buildQueryContext(extractedContents, contextTabs, query);
 *
 * // Use the rendered text as context
 * const fullQuery = contextResult.text;
 *
 * // Access envelope for more advanced use cases
 * const { envelope, sources } = contextResult;
 * ```
 */

import type { ExtractedContent, ContextTabInfo } from '../../../types.js';
import type {
  Source,
  ContextEnvelope,
  ContextEnvelopeOptions,
} from '../../../types/context-ir.js';
import { buildSource } from './source-builder.js';
import { buildContextEnvelope, renderEnvelopeAsText, estimateTokens } from './context-ir-builder.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of building query context
 */
export interface QueryContextResult {
  /** The rendered text context (ready to send to LLM) */
  text: string;

  /** The context envelope (for advanced use cases) */
  envelope: ContextEnvelope;

  /** The source objects (for reference) */
  sources: Source[];

  /** Statistics about the context */
  stats: {
    sourceCount: number;
    chunkCount: number;
    attachmentCount: number;
    estimatedTokens: number;
  };
}

/**
 * Options for building query context
 */
export interface QueryContextOptions extends ContextEnvelopeOptions {
  /** Whether to include citation instructions in the rendered output */
  includeCiteInstruction?: boolean;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Build query context from extracted content and tab info.
 *
 * This is the main integration point for query-handlers.ts.
 * It transforms the existing ExtractedContent format into the new
 * Context IR representation and renders it as text.
 *
 * @param extractedContents - Content extracted from tabs
 * @param tabInfos - Information about the source tabs
 * @param task - The user's query
 * @param options - Optional configuration
 * @returns QueryContextResult with rendered text and metadata
 */
export function buildQueryContext(
  extractedContents: ExtractedContent[],
  tabInfos: ContextTabInfo[],
  task: string,
  options: QueryContextOptions = {}
): QueryContextResult {
  // Build sources from extracted content
  const sources = buildSourcesFromExtracted(extractedContents, tabInfos);

  // Build envelope
  const envelope = buildContextEnvelope(sources, task, options);

  // Render to text
  const text = renderEnvelopeAsText(envelope);

  // Calculate stats
  const stats = {
    sourceCount: sources.length,
    chunkCount: envelope.chunks.length,
    attachmentCount: envelope.attachments.filter((a) => a.included).length,
    estimatedTokens: envelope.budget.used_tokens,
  };

  return { text, envelope, sources, stats };
}

/**
 * Build sources from extracted content with matching tab info.
 *
 * Creates a Source for each ExtractedContent, matching with the
 * corresponding ContextTabInfo by index (or using a default if not found).
 */
export function buildSourcesFromExtracted(
  extractedContents: ExtractedContent[],
  tabInfos: ContextTabInfo[]
): Source[] {
  return extractedContents.map((extracted, index) => {
    // Match tab info by index, or create a default
    const tabInfo = tabInfos[index] || createDefaultTabInfo(extracted, index);
    return buildSource(extracted, tabInfo);
  });
}

/**
 * Create a default ContextTabInfo from ExtractedContent
 */
function createDefaultTabInfo(
  extracted: ExtractedContent,
  index: number
): ContextTabInfo {
  return {
    id: `tab-${index}`,
    title: extracted.title,
    url: extracted.url,
    type: mapExtractedTypeToTabType(extracted.type),
  };
}

/**
 * Map extracted content type to tab type
 */
function mapExtractedTypeToTabType(
  type: ExtractedContent['type']
): ContextTabInfo['type'] {
  switch (type) {
    case 'html':
      return 'webpage';
    case 'pdf':
      return 'pdf';
    case 'image':
      return 'upload';
    case 'text':
      return 'notes';
    default:
      return 'webpage';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick estimate of tokens for a query with context.
 *
 * Useful for checking if content will fit within token limits
 * before building the full envelope.
 */
export function estimateQueryTokens(
  extractedContents: ExtractedContent[],
  task: string
): number {
  let totalTokens = estimateTokens(task);

  for (const content of extractedContents) {
    if (typeof content.content === 'string') {
      totalTokens += estimateTokens(content.content);
    } else if ('mainContent' in content.content) {
      // SerializedDOM
      totalTokens += estimateTokens(content.content.mainContent || '');
    } else if ('text' in content.content) {
      // PDFContent
      totalTokens += estimateTokens(content.content.text);
    }
  }

  return totalTokens;
}

/**
 * Check if context should use the new IR system.
 *
 * This can be used as a feature flag during gradual rollout.
 * Currently returns true for all cases, but could be configured
 * to enable for specific providers or content types.
 */
export function shouldUseContextIR(
  _extractedContents: ExtractedContent[],
  _options?: { provider?: string }
): boolean {
  // Phase 2: Always available, opt-in usage
  // The caller decides whether to use buildQueryContext or the legacy approach
  return true;
}
