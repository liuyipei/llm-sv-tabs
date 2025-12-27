/**
 * Query Context Builder - Integration between query-handlers and Context IR
 */

import type { ExtractedContent, ContextTabInfo } from '../../../types.js';
import type { Source, ContextEnvelope, ContextEnvelopeOptions } from '../../../types/context-ir.js';
import { buildSource } from './source-builder.js';
import { buildContextEnvelope, renderEnvelopeAsText, estimateTokens } from './context-ir-builder.js';

export interface QueryContextResult {
  text: string;
  envelope: ContextEnvelope;
  sources: Source[];
  stats: { sourceCount: number; chunkCount: number; attachmentCount: number; estimatedTokens: number };
}

export interface QueryContextOptions extends ContextEnvelopeOptions {
  includeCiteInstruction?: boolean;
}

export function buildQueryContext(
  extractedContents: ExtractedContent[],
  tabInfos: ContextTabInfo[],
  task: string,
  options: QueryContextOptions = {}
): QueryContextResult {
  const sources = buildSourcesFromExtracted(extractedContents, tabInfos);
  const envelope = buildContextEnvelope(sources, task, options);
  return {
    text: renderEnvelopeAsText(envelope),
    envelope,
    sources,
    stats: {
      sourceCount: sources.length,
      chunkCount: envelope.chunks.length,
      attachmentCount: envelope.attachments.filter((a) => a.included).length,
      estimatedTokens: envelope.budget.used_tokens,
    },
  };
}

export function buildSourcesFromExtracted(extractedContents: ExtractedContent[], tabInfos: ContextTabInfo[]): Source[] {
  const typeMap: Record<ExtractedContent['type'], ContextTabInfo['type']> = { html: 'webpage', pdf: 'pdf', image: 'upload', text: 'notes' };
  return extractedContents.map((extracted, i) => {
    const tabInfo = tabInfos[i] || { id: `tab-${i}`, title: extracted.title, url: extracted.url, type: typeMap[extracted.type] || 'webpage' };
    return buildSource(extracted, tabInfo);
  });
}

export function estimateQueryTokens(extractedContents: ExtractedContent[], task: string): number {
  return extractedContents.reduce((sum, c) => {
    if (typeof c.content === 'string') return sum + estimateTokens(c.content);
    if ('mainContent' in c.content) return sum + estimateTokens(c.content.mainContent || '');
    if ('text' in c.content) return sum + estimateTokens(c.content.text);
    return sum;
  }, estimateTokens(task));
}

export const shouldUseContextIR = () => true;
