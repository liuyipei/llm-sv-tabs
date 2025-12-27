/**
 * Token Budget Manager - 5-stage degrade ladder
 *
 * Stages:
 *   0: Full content
 *   1: Remove low-ranked chunks (mark as "[omitted]")
 *   2: Extractive summary of low-ranked sources
 *   3: Reduce to top-K chunks
 *   4: Hard truncate at semantic boundaries
 *   5: Context Index + Task only
 */

import type {
  ContextEnvelope, ContextChunk, ContextIndexEntry, DegradeStage,
  TokenBudgetCut, Anchor,
} from '../../../types/context-ir.js';
import { estimateTokens, renderContextIndex } from './context-ir-builder.js';

export interface TokenBudgetOptions {
  maxTokens: number;
  /** Tokens to reserve for task (default: 500) */
  taskReserve?: number;
  /** Min chunks to keep at stage 3 (default: 3) */
  minChunks?: number;
}

/** Apply token budget, returning a new envelope at the appropriate degrade stage */
export function applyTokenBudget(envelope: ContextEnvelope, options: TokenBudgetOptions): ContextEnvelope {
  const { maxTokens, taskReserve = 500, minChunks = 3 } = options;
  if (maxTokens <= 0) return envelope;

  const taskTokens = estimateTokens(envelope.task);
  const indexTokens = estimateTokens(renderContextIndex(envelope.index));
  const baseTokens = taskTokens + indexTokens + taskReserve;
  const contentBudget = maxTokens - baseTokens;

  if (contentBudget <= 0) {
    // Stage 5: Only index + task fit
    return buildStage5(envelope, maxTokens, taskTokens + indexTokens);
  }

  // Check if full content fits (Stage 0)
  const totalChunkTokens = envelope.chunks.reduce((s, c) => s + c.token_count, 0);
  if (totalChunkTokens <= contentBudget) {
    return { ...envelope, budget: { max_tokens: maxTokens, used_tokens: baseTokens + totalChunkTokens, degrade_stage: 0, cuts: [] } };
  }

  // Try stages 1-4
  let result = tryStage1(envelope, contentBudget, minChunks);
  if (result.fits) return finalize(envelope, result.chunks, result.cuts, 1, maxTokens, baseTokens);

  result = tryStage2(envelope, result.chunks, contentBudget, minChunks);
  if (result.fits) return finalize(envelope, result.chunks, result.cuts, 2, maxTokens, baseTokens);

  result = tryStage3(result.chunks, contentBudget, minChunks);
  if (result.fits) return finalize(envelope, result.chunks, result.cuts, 3, maxTokens, baseTokens);

  result = tryStage4(result.chunks, contentBudget);
  if (result.fits) return finalize(envelope, result.chunks, result.cuts, 4, maxTokens, baseTokens);

  // Fall through to stage 5
  return buildStage5(envelope, maxTokens, taskTokens + indexTokens);
}

interface StageResult {
  fits: boolean;
  chunks: ContextChunk[];
  cuts: TokenBudgetCut[];
}

function countTokens(chunks: ContextChunk[]): number {
  return chunks.reduce((s, c) => s + c.token_count, 0);
}

/** Stage 1: Remove low-ranked chunks, keep as "[omitted]" placeholders */
function tryStage1(envelope: ContextEnvelope, budget: number, minKeep: number): StageResult {
  const sorted = [...envelope.chunks].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  const keep: ContextChunk[] = [];
  const cuts: TokenBudgetCut[] = [];
  let tokens = 0;

  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i];
    if (tokens + chunk.token_count <= budget || keep.length < minKeep) {
      keep.push(chunk);
      tokens += chunk.token_count;
    } else {
      cuts.push({ type: 'chunk_removed', anchor: chunk.anchor, original_tokens: chunk.token_count, reason: 'stage1_low_rank' });
    }
  }
  return { fits: tokens <= budget, chunks: keep, cuts };
}

/** Stage 2: Extractive summary for remaining low-value chunks */
function tryStage2(envelope: ContextEnvelope, chunks: ContextChunk[], budget: number, minKeep: number): StageResult {
  const sorted = [...chunks].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  const result: ContextChunk[] = [];
  const cuts: TokenBudgetCut[] = [];
  let tokens = 0;

  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i];
    if (tokens + chunk.token_count <= budget || result.length < minKeep) {
      result.push(chunk);
      tokens += chunk.token_count;
    } else {
      // Summarize instead of remove
      const summary = extractiveSummary(chunk.content, chunk.anchor);
      const summaryTokens = estimateTokens(summary);
      if (tokens + summaryTokens <= budget) {
        result.push({ ...chunk, content: summary, token_count: summaryTokens, truncated: true });
        tokens += summaryTokens;
        cuts.push({ type: 'summarized', anchor: chunk.anchor, original_tokens: chunk.token_count, reason: 'stage2_extractive' });
      } else {
        cuts.push({ type: 'chunk_removed', anchor: chunk.anchor, original_tokens: chunk.token_count, reason: 'stage2_no_fit' });
      }
    }
  }
  return { fits: tokens <= budget, chunks: result, cuts };
}

/** Stage 3: Keep only top-K chunks */
function tryStage3(chunks: ContextChunk[], budget: number, topK: number): StageResult {
  const sorted = [...chunks].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  const keep = sorted.slice(0, Math.max(topK, 1));
  const removed = sorted.slice(Math.max(topK, 1));
  const cuts: TokenBudgetCut[] = removed.map(c => ({
    type: 'chunk_removed', anchor: c.anchor, original_tokens: c.token_count, reason: 'stage3_topk'
  }));
  return { fits: countTokens(keep) <= budget, chunks: keep, cuts };
}

/** Stage 4: Hard truncate at semantic boundaries */
function tryStage4(chunks: ContextChunk[], budget: number): StageResult {
  const result: ContextChunk[] = [];
  const cuts: TokenBudgetCut[] = [];
  let tokens = 0;

  for (const chunk of chunks) {
    if (tokens >= budget) {
      cuts.push({ type: 'chunk_removed', anchor: chunk.anchor, original_tokens: chunk.token_count, reason: 'stage4_budget' });
      continue;
    }
    const remaining = budget - tokens;
    if (chunk.token_count <= remaining) {
      result.push(chunk);
      tokens += chunk.token_count;
    } else {
      // Truncate at semantic boundary
      const truncated = truncateAtBoundary(chunk.content, remaining * 4); // tokens * 4 ≈ chars
      const truncTokens = estimateTokens(truncated);
      result.push({ ...chunk, content: truncated, token_count: truncTokens, truncated: true });
      tokens += truncTokens;
      cuts.push({ type: 'chunk_truncated', anchor: chunk.anchor, original_tokens: chunk.token_count, reason: 'stage4_boundary' });
    }
  }
  return { fits: tokens <= budget, chunks: result, cuts };
}

function buildStage5(envelope: ContextEnvelope, maxTokens: number, usedTokens: number): ContextEnvelope {
  const cuts: TokenBudgetCut[] = envelope.chunks.map(c => ({
    type: 'chunk_removed', anchor: c.anchor, original_tokens: c.token_count, reason: 'stage5_minimal'
  }));
  const indexWithSummaries: ContextIndexEntry[] = envelope.index.entries.map(e => ({
    ...e,
    content_included: false,
    summary: getSourceSummary(envelope, e.source_id),
  }));
  return {
    ...envelope,
    chunks: [],
    attachments: envelope.attachments.map(a => ({ ...a, included: false })),
    index: { entries: indexWithSummaries },
    budget: { max_tokens: maxTokens, used_tokens: usedTokens, degrade_stage: 5, cuts },
  };
}

function finalize(
  envelope: ContextEnvelope, chunks: ContextChunk[], cuts: TokenBudgetCut[],
  stage: DegradeStage, maxTokens: number, baseTokens: number
): ContextEnvelope {
  const usedTokens = baseTokens + countTokens(chunks);
  const includedSources = new Set(chunks.map(c => c.source_id));
  const updatedIndex: ContextIndexEntry[] = envelope.index.entries.map(e => ({
    ...e,
    content_included: includedSources.has(e.source_id),
    summary: includedSources.has(e.source_id) ? undefined : getSourceSummary(envelope, e.source_id),
  }));
  return {
    ...envelope,
    chunks,
    index: { entries: updatedIndex },
    budget: { max_tokens: maxTokens, used_tokens: usedTokens, degrade_stage: stage, cuts },
  };
}

function getSourceSummary(envelope: ContextEnvelope, sourceId: string): string | undefined {
  const chunk = envelope.chunks.find(c => c.source_id === sourceId);
  if (!chunk) return undefined;
  const sentences = chunk.content.split(/[.!?]+\s+/).slice(0, 2);
  return sentences.join('. ').substring(0, 150) || undefined;
}

// === Extractive Summarization ===

/** Extract first 2-3 sentences as summary (no LLM calls) */
export function extractiveSummary(content: string, anchor: Anchor): string {
  const sentences = content.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const summary = sentences.slice(0, 3).join(' ').trim();
  if (!summary) return `[see ${anchor} for content]`;
  const maxLen = 300;
  const text = summary.length > maxLen ? summary.substring(0, maxLen) + '...' : summary;
  return `${text} [extractive summary, see ${anchor} for full content]`;
}

// === Semantic Boundary Detection ===

/** Find semantic boundaries in text: headings, paragraphs, page breaks */
export function findSemanticBoundaries(text: string): number[] {
  const boundaries: number[] = [0];
  const patterns = [
    /\n#{1,6}\s+/g,           // Markdown headings
    /\n\n+/g,                  // Paragraph breaks
    /---+\n/g,                 // Horizontal rules
    /\n\[Page \d+\]/gi,        // Page markers
    /\n(?=[A-Z][^.!?]{20,})/g, // Sentences starting with capital
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      boundaries.push(match.index);
    }
  }
  boundaries.push(text.length);
  return [...new Set(boundaries)].sort((a, b) => a - b);
}

/** Truncate text at the nearest semantic boundary within maxChars */
export function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const boundaries = findSemanticBoundaries(text);
  // Find largest boundary <= maxChars
  let best = 0;
  for (const b of boundaries) {
    if (b <= maxChars) best = b;
    else break;
  }
  // If no good boundary, fall back to word boundary
  if (best < maxChars * 0.5) {
    const wordBoundary = text.lastIndexOf(' ', maxChars);
    if (wordBoundary > maxChars * 0.5) best = wordBoundary;
  }
  if (best === 0) best = maxChars;
  return text.substring(0, best).trim() + '... [truncated]';
}
