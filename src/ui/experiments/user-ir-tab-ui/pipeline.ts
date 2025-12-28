import type {
  AttachmentManifest,
  ContextChunk,
  ContextEnvelope,
  ContextIndexEntry,
  Source,
  SourceId,
  SourceKind,
  TokenBudgetCut,
} from '../../../types/context-ir';
import {
  type CapabilityPath,
  type ChunkAnnotation,
  type DegradeStageLabel,
  type EncodingStep,
  type EnvelopePreview,
  type ExperimentSource,
  type LogEntry,
  type PipelineRun,
  type ProviderPayloadPreview,
  type TabControls,
  type WorkflowStage,
} from './types';

const TOKEN_ESTIMATE_RATIO = 0.24;
const QUALITY_BOOST: Record<string, number> = {
  good: 1,
  mixed: 0.85,
  low: 0.65,
  ocr_like: 0.55,
};

const DEGRADE_ORDER: DegradeStageLabel[] = ['keep', 'omit-header', 'summarize', 'hard-drop'];

export interface PipelineInputs {
  tabId: string;
  title: string;
  task: string;
  controls: TabControls;
  sources: ExperimentSource[];
}

interface NormalizedOutput {
  chunks: ContextChunk[];
  attachments: AttachmentManifest[];
  steps: EncodingStep[];
  logs: LogEntry[];
}

interface RankedOutput {
  chunks: ContextChunk[];
  steps: EncodingStep[];
  logs: LogEntry[];
}

interface BudgetOutput {
  chunks: ContextChunk[];
  annotations: ChunkAnnotation[];
  cuts: TokenBudgetCut[];
  degrade: DegradeStageLabel;
  steps: EncodingStep[];
  logs: LogEntry[];
}

const now = () => Date.now();

const estimateTokens = (text: string): number =>
  Math.max(8, Math.ceil(text.replace(/\s+/g, ' ').trim().length * TOKEN_ESTIMATE_RATIO));

const summarizeContent = (content: string, targetTokens: number): string => {
  const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences.slice(0, 2).join(' ');
  const bulletPool = sentences.slice(2, 6).map((sentence) => `- ${sentence.trim()}`);
  const summary = [first, ...bulletPool].join('\n');
  const trimmed = summary.length > targetTokens * 4 ? summary.slice(0, targetTokens * 4) : summary;
  return trimmed || content.slice(0, Math.min(content.length, targetTokens * 4));
};

const anchorFor = (source: Source, suffix?: string): string =>
  suffix ? `${source.source_id}#${suffix}` : source.source_id;

const buildLog = (step: EncodingStep, message: string, detail?: Record<string, unknown>): LogEntry => ({
  step_id: step.step_id,
  message,
  detail,
  level: 'info',
  created_at: step.timestamp,
});

const buildWarnLog = (
  step: EncodingStep,
  message: string,
  detail?: Record<string, unknown>,
): LogEntry => ({
  step_id: step.step_id,
  message,
  detail,
  level: 'warn',
  created_at: step.timestamp,
});

const stepId = (stage: WorkflowStage, index: number) => `${stage}-${index}`;

const normalizeSources = (
  inputs: PipelineInputs,
  stageIndex: number,
): NormalizedOutput => {
  const steps: EncodingStep[] = [];
  const logs: LogEntry[] = [];
  const attachments: AttachmentManifest[] = [];
  const chunks: ContextChunk[] = [];

  inputs.sources.forEach((source, idx) => {
    const step: EncodingStep = {
      step_id: stepId('normalize', stageIndex + idx),
      stage: 'normalize',
      kind: 'normalize',
      input_refs: [source.source_id],
      output_refs: [],
      reason: 'Sanitize source and emit normalized chunk(s)',
      token_estimate: 0,
      capability_path: inputs.controls.capabilityPath,
      params: { summarizeLongerThan: inputs.controls.summarizeLongerThan },
      timestamp: now(),
    };

    const addChunk = (content: string, anchorSuffix?: string, extraction_method = 'normalized') => {
      const anchor = anchorFor(source, anchorSuffix);
      const token_count = estimateTokens(content);
      const chunk: ContextChunk = {
        anchor,
        source_id: source.source_id,
        source_type: source.kind,
        title: source.title,
        url: 'url' in source ? source.url : undefined,
        extraction_method,
        quality: 'quality' in source ? source.quality : undefined,
        content,
        token_count,
      };
      chunks.push(chunk);
      step.output_refs.push(anchor);
      step.token_estimate += token_count;
    };

    if (source.kind === 'webpage') {
      const content = source.markdown.trim();
      addChunk(content, undefined, `markdown:${source.extraction_type}`);
      if (source.screenshot) {
        attachments.push({
          anchor: anchorFor(source, 'screenshot'),
          source_id: source.source_id,
          artifact_type: 'screenshot',
          mime_type: source.screenshot.mime_type,
          byte_size: source.screenshot.byte_size,
          included: inputs.controls.includeAttachments,
        });
      }
    } else if (source.kind === 'note') {
      addChunk(source.text.trim(), undefined, 'note');
    } else if (source.kind === 'chatlog') {
      const serialized = source.messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');
      addChunk(serialized, undefined, 'chatlog');
    } else if (source.kind === 'image') {
      const alt = source.alt_text || 'Screenshot';
      addChunk(`Image: ${alt}`, 'image', 'image');
      attachments.push({
        anchor: anchorFor(source, 'image'),
        source_id: source.source_id,
        artifact_type: 'screenshot',
        mime_type: source.image.mime_type,
        byte_size: source.image.byte_size,
        included: inputs.controls.includeAttachments,
      });
    } else if (source.kind === 'pdf') {
      source.pages.forEach((page) => {
        const content = (page.text || 'Page with no extracted text').trim();
        addChunk(content, `p=${page.page_number}`, 'pdf-page');
        if (page.image) {
          attachments.push({
            anchor: anchorFor(source, `p=${page.page_number}`),
            source_id: source.source_id,
            artifact_type: 'page_image',
            mime_type: page.image.mime_type,
            byte_size: page.image.byte_size,
            included: inputs.controls.includeAttachments,
          });
        }
      });
      if (source.pdf_bytes) {
        attachments.push({
          anchor: anchorFor(source),
          source_id: source.source_id,
          artifact_type: 'raw_pdf',
          mime_type: source.pdf_bytes.mime_type,
          byte_size: source.pdf_bytes.byte_size,
          included: inputs.controls.includeAttachments,
        });
      }
    }

    steps.push(step);
    logs.push(buildLog(step, `Normalized ${source.title}`, { outputs: step.output_refs }));
  });

  return { chunks, attachments, steps, logs };
};

const rankChunks = (
  inputs: PipelineInputs,
  normalized: ContextChunk[],
  stageIndex: number,
): RankedOutput => {
  const steps: EncodingStep[] = [];
  const logs: LogEntry[] = [];
  const step: EncodingStep = {
    step_id: stepId('rank', stageIndex),
    stage: 'rank',
    kind: 'rank',
    input_refs: normalized.map((c) => c.anchor),
    output_refs: [],
    reason: inputs.controls.noHeuristics
      ? 'No heuristics mode: preserve order, set scores to 1.0'
      : 'Deterministic scoring by recency, quality, and kind',
    token_estimate: normalized.reduce((acc, c) => acc + c.token_count, 0),
    capability_path: inputs.controls.capabilityPath,
    params: inputs.controls.rankingWeights,
    timestamp: now(),
  };

  const maxCaptured = Math.max(...inputs.sources.map((s) => s.captured_at));
  const minCaptured = Math.min(...inputs.sources.map((s) => s.captured_at));
  const denom = Math.max(1, maxCaptured - minCaptured);

  const qualityBoost = (quality?: string) => QUALITY_BOOST[quality || 'good'] ?? 0.75;

  const scored = normalized.map((chunk, idx) => {
    if (inputs.controls.noHeuristics) {
      return { ...chunk, relevance_score: 1, rankKey: idx };
    }
    const source = inputs.sources.find((s) => s.source_id === chunk.source_id)!;
    const recency = (source.captured_at - minCaptured) / denom;
    const quality = qualityBoost(
      'quality' in source ? (source as { quality?: string }).quality : undefined,
    );
    const kindBoost = inputs.controls.rankingWeights.kind[source.kind] ?? 1;
    const score =
      inputs.controls.rankingWeights.recency * recency +
      inputs.controls.rankingWeights.quality * quality +
      0.2 * kindBoost;
    const priority = inputs.controls.priorities[source.source_id] || 'default';
    const priorityBoost = priority === 'forced' ? 0.3 : priority === 'excluded' ? -1 : 0;
    return { ...chunk, relevance_score: Number((score + priorityBoost).toFixed(3)), rankKey: idx };
  });

  scored.sort((a, b) => {
    if (inputs.controls.noHeuristics) return a.rankKey - b.rankKey;
    return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
  });

  const rankedChunks = scored.map(({ rankKey, ...rest }) => rest);
  step.output_refs = rankedChunks.map((c) => c.anchor);
  steps.push(step);
  logs.push(buildLog(step, 'Ranking complete', { scores: rankedChunks.map((c) => c.relevance_score) }));

  return { chunks: rankedChunks, steps, logs };
};

const nextDegradeStage = (current: DegradeStageLabel): DegradeStageLabel => {
  const idx = DEGRADE_ORDER.indexOf(current);
  return DEGRADE_ORDER[Math.min(DEGRADE_ORDER.length - 1, idx + 1)];
};

const applyBudget = (
  inputs: PipelineInputs,
  ranked: ContextChunk[],
  stageIndex: number,
): BudgetOutput => {
  const steps: EncodingStep[] = [];
  const logs: LogEntry[] = [];
  const annotations: ChunkAnnotation[] = [];
  const cuts: TokenBudgetCut[] = [];
  const maxTokens = inputs.controls.maxTokens;
  const step: EncodingStep = {
    step_id: stepId('budget', stageIndex),
    stage: 'budget',
    kind: 'budget',
    input_refs: ranked.map((c) => c.anchor),
    output_refs: [],
    reason: 'Apply degrade ladder to meet token budget',
    token_estimate: ranked.reduce((acc, c) => acc + c.token_count, 0),
    capability_path: inputs.controls.capabilityPath,
    params: { maxTokens },
    timestamp: now(),
  };

  let currentStage: DegradeStageLabel = 'keep';
  const workingChunks = ranked.map((c) => ({ ...c }));

  const tagAnnotation = (
    anchor: string,
    included: boolean,
    reason: string,
    stageLabel: DegradeStageLabel,
    summary?: string,
  ) => {
    annotations.push({ anchor, included, reason, stage: stageLabel, summary });
  };

  const totalTokens = () => workingChunks.reduce((acc, c) => acc + c.token_count, 0);

  let safetyCounter = 0;
  while (totalTokens() > maxTokens && safetyCounter < 30) {
    safetyCounter += 1;
    const candidate = [...workingChunks]
      .filter((c) => {
        const priority = inputs.controls.priorities[c.source_id] || 'default';
        return priority !== 'forced';
      })
      .sort((a, b) => (a.relevance_score ?? 0) - (b.relevance_score ?? 0))[0];

    if (!candidate) break;
    const idx = workingChunks.findIndex((c) => c.anchor === candidate.anchor);

    if (currentStage === 'keep') {
      currentStage = 'omit-header';
      const headerOnly = `${candidate.title} — header only`;
      cuts.push({
        type: 'chunk_truncated',
        anchor: candidate.anchor,
        original_tokens: candidate.token_count,
        reason: 'Omit body, keep header',
      });
      workingChunks[idx] = {
        ...candidate,
        content: headerOnly,
        token_count: estimateTokens(headerOnly),
      };
      tagAnnotation(candidate.anchor, true, 'Body omitted due to budget', currentStage);
    } else if (currentStage === 'omit-header') {
      currentStage = 'summarize';
      const summary = summarizeContent(candidate.content, Math.round(inputs.controls.maxTokens / 6));
      cuts.push({
        type: 'summarized',
        anchor: candidate.anchor,
        original_tokens: candidate.token_count,
        reason: 'Summarized to fit budget',
      });
      workingChunks[idx] = {
        ...candidate,
        content: summary,
        token_count: estimateTokens(summary),
        truncated: true,
      };
      tagAnnotation(candidate.anchor, true, 'Summarized due to budget', currentStage, summary);
    } else {
      currentStage = 'hard-drop';
      cuts.push({
        type: 'chunk_removed',
        anchor: candidate.anchor,
        original_tokens: candidate.token_count,
        reason: 'Hard drop after summarize',
      });
      workingChunks.splice(idx, 1);
      tagAnnotation(candidate.anchor, false, 'Hard dropped to meet budget', currentStage);
    }
  }

  step.degrade_stage = currentStage;
  step.output_refs = workingChunks.map((c) => c.anchor);
  steps.push(step);
  logs.push(
    buildLog(step, 'Budget applied', {
      remainingTokens: workingChunks.reduce((acc, c) => acc + c.token_count, 0),
      cuts,
      degrade: currentStage,
    }),
  );

  if (safetyCounter >= 30) {
    logs.push(buildWarnLog(step, 'Budget loop bailed out after 30 iterations'));
  }

  return {
    chunks: workingChunks,
    annotations,
    cuts,
    degrade: currentStage,
    steps,
    logs,
  };
};

const degradeStageNumber = (label: DegradeStageLabel): number =>
  Math.max(0, DEGRADE_ORDER.indexOf(label));

const capabilityWarnings = (capability: CapabilityPath, attachments: AttachmentManifest[]): string[] => {
  const warns: string[] = [];
  if (capability === 'text-only') {
    const blocked = attachments.filter((a) => a.artifact_type !== 'text');
    if (blocked.length) {
      warns.push(`Text-only path drops ${blocked.length} attachment(s).`);
    }
  }
  if (capability === 'native-doc') {
    const hasPdf = attachments.some((a) => a.artifact_type === 'raw_pdf' && a.included);
    if (!hasPdf) warns.push('Native-doc path requested but no PDF bytes are available.');
  }
  return warns;
};

const buildIndex = (sources: ExperimentSource[], chunks: ContextChunk[]): ContextIndexEntry[] => {
  const chunksBySource = chunks.reduce<Record<SourceId, ContextChunk[]>>((acc, chunk) => {
    acc[chunk.source_id] = acc[chunk.source_id] || [];
    acc[chunk.source_id].push(chunk);
    return acc;
  }, {});

  return sources.map((source) => {
    const sourceChunks = chunksBySource[source.source_id] || [];
    const summary =
      sourceChunks.length && sourceChunks[0].content.length > 120
        ? `${sourceChunks[0].content.slice(0, 120)}…`
        : sourceChunks[0]?.content;
    const pages_attached =
      source.kind === 'pdf'
        ? sourceChunks
            .map((c) => c.anchor.match(/p=(\d+)/)?.[1])
            .filter(Boolean)
            .map((p) => Number(p))
        : undefined;
    return {
      source_id: source.source_id,
      title: source.title,
      url: 'url' in source ? source.url : undefined,
      source_type: source.kind,
      pages_attached,
      summary,
      content_included: Boolean(sourceChunks.length),
    };
  });
};

const filterAttachmentsByCapability = (
  capability: CapabilityPath,
  include: boolean,
  attachments: AttachmentManifest[],
): AttachmentManifest[] => {
  if (!include) {
    return attachments.map((a) => ({ ...a, included: false }));
  }

  if (capability === 'text-only') {
    return attachments.map((a) => ({ ...a, included: false }));
  }

  if (capability === 'vision') {
    return attachments.map((a) =>
      a.artifact_type === 'screenshot' || a.artifact_type === 'page_image'
        ? { ...a, included: true }
        : { ...a, included: false },
    );
  }

  // native-doc
  return attachments.map((a) => ({ ...a, included: a.artifact_type === 'raw_pdf' || a.artifact_type === 'page_image' }));
};

const providerPayloads = (
  chunks: ContextChunk[],
  attachments: AttachmentManifest[],
  capability: CapabilityPath,
): ProviderPayloadPreview[] => {
  const text = chunks
    .map((c, idx) => `${idx + 1}. [${c.anchor}] ${c.content.slice(0, 160)}`)
    .join('\n');
  const attachmentList = attachments.filter((a) => a.included).map((a) => `${a.anchor} (${a.artifact_type})`);
  const base = {
    capability,
    content: text,
    attachments: attachmentList,
  };
  const warnings =
    capability === 'text-only' && attachmentList.length
      ? ['Attachments are ignored for text-only paths']
      : undefined;

  return [
    { provider: 'openai', ...base, warnings },
    { provider: 'anthropic', ...base, warnings },
    { provider: 'gemini', ...base, warnings },
  ];
};

const buildEnvelope = (
  inputs: PipelineInputs,
  normalized: NormalizedOutput,
  budgeted: BudgetOutput,
): EnvelopePreview => {
  const attachments = filterAttachmentsByCapability(
    inputs.controls.capabilityPath,
    inputs.controls.includeAttachments,
    normalized.attachments,
  );
  const warnings = capabilityWarnings(inputs.controls.capabilityPath, attachments);
  const used_tokens = budgeted.chunks.reduce((acc, c) => acc + c.token_count, 0);

  const envelope: ContextEnvelope = {
    version: '1.0',
    created_at: now(),
    sources: inputs.sources,
    index: { entries: buildIndex(inputs.sources, budgeted.chunks) },
    chunks: budgeted.chunks,
    attachments,
    budget: {
      max_tokens: inputs.controls.maxTokens,
      used_tokens,
      degrade_stage: degradeStageNumber(budgeted.degrade) as ContextEnvelope['budget']['degrade_stage'],
      cuts: budgeted.cuts,
    },
    task: inputs.task,
  };

  return {
    ...envelope,
    degrade_stage_label: budgeted.degrade,
    provider_payloads: providerPayloads(budgeted.chunks, attachments, inputs.controls.capabilityPath),
    capability_path: inputs.controls.capabilityPath,
    chunk_annotations: budgeted.annotations,
  };
};

export const runPipeline = (inputs: PipelineInputs): PipelineRun => {
  const normalized = normalizeSources(inputs, 0);
  const ranked = rankChunks(inputs, normalized.chunks, normalized.steps.length);
  const budgeted = applyBudget(inputs, ranked.chunks, normalized.steps.length + ranked.steps.length);
  const envelope = buildEnvelope(inputs, normalized, budgeted);

  const steps = [...normalized.steps, ...ranked.steps, ...budgeted.steps];
  const logs = [...normalized.logs, ...ranked.logs, ...budgeted.logs];
  const warnings = capabilityWarnings(inputs.controls.capabilityPath, envelope.attachments);

  steps.push({
    step_id: stepId('payload-build', steps.length + 1),
    stage: 'payload-build',
    kind: 'payload-build',
    input_refs: budgeted.chunks.map((c) => c.anchor),
    output_refs: envelope.provider_payloads.map((p) => `${p.provider}:${inputs.tabId}`),
    reason: 'Mock provider payloads rendered',
    token_estimate: envelope.budget.used_tokens,
    capability_path: inputs.controls.capabilityPath,
    params: { capability: inputs.controls.capabilityPath },
    timestamp: now(),
  });

  logs.push({
    step_id: steps[steps.length - 1].step_id,
    message: 'Preview payloads ready',
    level: warnings.length ? 'warn' : 'info',
    detail: { warnings },
    created_at: now(),
  });

  return {
    envelope,
    steps,
    logs,
    warnings,
  };
};
