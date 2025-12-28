import { runPipeline, type PipelineInputs } from './pipeline';
import type {
  BranchInfo,
  CustomNote,
  ExperimentTab,
  FixtureTab,
  TabControls,
} from './types';

const uniqueId = (prefix: string) => `${prefix}-${Math.random().toString(16).slice(2, 8)}`;

const buildInputs = (tabId: string, fixture: FixtureTab): PipelineInputs => ({
  tabId,
  title: fixture.title,
  task: fixture.task,
  controls: fixture.controls,
  sources: fixture.sources,
});

export const buildTabFromFixture = (
  fixture: FixtureTab,
  branchInfo?: BranchInfo,
): ExperimentTab => {
  const tab_id = branchInfo ? uniqueId(`${fixture.slug}-branch`) : `tab-${fixture.slug}`;
  const run = runPipeline(buildInputs(tab_id, fixture));

  return {
    tab_id,
    title: branchInfo ? `${fixture.title} (branched)` : fixture.title,
    scenario: fixture.scenario,
    task: fixture.task,
    controls: fixture.controls,
    workflow_state: fixture.workflow_state ?? 'send',
    sources: fixture.sources,
    history: [...run.steps],
    branches: branchInfo ? [branchInfo.parent_tab_id] : [],
    lastRun: run,
  };
};

export const initializeTabs = (fixtures: FixtureTab[]): ExperimentTab[] =>
  fixtures.map((fixture) => buildTabFromFixture(fixture));

export const rerunTab = (tab: ExperimentTab, controls?: Partial<TabControls>): ExperimentTab => {
  const updatedControls = { ...tab.controls, ...(controls ?? {}) };
  const run = runPipeline(
    buildInputs(tab.tab_id, {
      slug: tab.tab_id,
      title: tab.title,
      scenario: tab.scenario,
      task: tab.task,
      controls: updatedControls,
      sources: tab.sources,
    }),
  );

  return {
    ...tab,
    controls: updatedControls,
    workflow_state: 'send',
    history: [...tab.history, ...run.steps],
    lastRun: run,
  };
};

export const branchTab = (tab: ExperimentTab, stepId: string): ExperimentTab => {
  const fixture: FixtureTab = {
    slug: `${tab.tab_id}-branch`,
    title: `${tab.title} → branch from ${stepId}`,
    scenario: `${tab.scenario} (branched)`,
    task: tab.task,
    controls: tab.controls,
    sources: tab.sources,
  };
  return buildTabFromFixture(fixture, { parent_tab_id: tab.tab_id, origin_step: stepId });
};

export const createNoteFromStep = (tab: ExperimentTab, stepId: string): CustomNote => {
  const step = tab.lastRun.steps.find((s) => s.step_id === stepId);
  const envelope = tab.lastRun.envelope;
  const summaryLines = envelope.chunk_annotations
    .map((ann) => `- ${ann.anchor}: ${ann.reason} (${ann.stage})`)
    .join('\n');
  const content = [
    `Tab: ${tab.title}`,
    `Step: ${step?.kind ?? 'unknown'} (${stepId})`,
    '',
    'What changed:',
    summaryLines || 'No budget changes for this step.',
  ].join('\n');

  return {
    note_id: uniqueId('note'),
    tab_id: tab.tab_id,
    from_step: stepId,
    title: `Note from ${stepId}`,
    content,
    created_at: Date.now(),
  };
};
