import type { ContextEnvelope, Source, SourceId, SourceKind } from '../../../types/context-ir';

export type CapabilityPath = 'text-only' | 'vision' | 'native-doc';
export type DegradeStageLabel = 'keep' | 'omit-header' | 'summarize' | 'hard-drop';
export type WorkflowStage = 'capture' | 'normalize' | 'rank' | 'budget' | 'preview' | 'send';

export interface AttachmentRequest {
  kind: 'screenshot' | 'page_image' | 'raw_pdf';
  description: string;
  anchor: string;
}

export interface ExperimentSource extends Source {
  attachments?: AttachmentRequest[];
  locators?: string[];
}

export interface EncodingStep {
  step_id: string;
  stage: WorkflowStage;
  kind: 'normalize' | 'rank' | 'budget' | 'summarize' | 'drop' | 'payload-build' | 'user-edit';
  input_refs: string[];
  output_refs: string[];
  reason: string;
  token_estimate: number;
  capability_path: CapabilityPath;
  params: Record<string, unknown>;
  summary?: string;
  timestamp: number;
  degrade_stage?: DegradeStageLabel;
}

export interface LogEntry {
  step_id: string;
  message: string;
  level: 'info' | 'warn';
  detail?: Record<string, unknown>;
  created_at: number;
}

export interface ProviderPayloadPreview {
  provider: 'openai' | 'anthropic' | 'gemini';
  capability: CapabilityPath;
  content: string;
  attachments: string[];
  warnings?: string[];
}

export interface ChunkAnnotation {
  anchor: string;
  reason: string;
  stage: DegradeStageLabel;
  summary?: string;
  included: boolean;
}

export interface EnvelopePreview extends ContextEnvelope {
  degrade_stage_label: DegradeStageLabel;
  provider_payloads: ProviderPayloadPreview[];
  capability_path: CapabilityPath;
  chunk_annotations: ChunkAnnotation[];
}

export interface PipelineRun {
  envelope: EnvelopePreview;
  steps: EncodingStep[];
  logs: LogEntry[];
  warnings: string[];
}

export interface RankingWeights {
  recency: number;
  quality: number;
  kind: Partial<Record<SourceKind, number>>;
}

export interface TabControls {
  capabilityPath: CapabilityPath;
  maxTokens: number;
  includeAttachments: boolean;
  noHeuristics: boolean;
  rankingWeights: RankingWeights;
  priorities: Record<SourceId, 'default' | 'forced' | 'excluded'>;
  summarizeLongerThan: number;
}

export interface ExperimentTab {
  tab_id: string;
  title: string;
  scenario: string;
  task: string;
  controls: TabControls;
  workflow_state: WorkflowStage;
  sources: ExperimentSource[];
  history: EncodingStep[];
  branches: string[];
  lastRun: PipelineRun;
}

export interface CustomNote {
  note_id: string;
  tab_id: string;
  from_step: string;
  title: string;
  content: string;
  created_at: number;
}

export interface BranchInfo {
  parent_tab_id: string;
  origin_step: string;
}

export interface FixtureTab {
  slug: string;
  title: string;
  scenario: string;
  task: string;
  controls: TabControls;
  sources: ExperimentSource[];
  workflow_state?: WorkflowStage;
}
