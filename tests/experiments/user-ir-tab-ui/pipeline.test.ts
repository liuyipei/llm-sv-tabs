import { describe, expect, it } from 'vitest';
import { buildFixtureTabs } from '../../../src/ui/experiments/user-ir-tab-ui/fixtures/mock-fixtures';
import { runPipeline } from '../../../src/ui/experiments/user-ir-tab-ui/pipeline';
import { createNoteFromStep, initializeTabs } from '../../../src/ui/experiments/user-ir-tab-ui/state';

describe('user-ir-tab-ui pipeline', () => {
  const fixtures = buildFixtureTabs();

  it('runs the text-only article scenario with explicit steps and budget', () => {
    const fixture = fixtures.find((f) => f.slug === 'text-article');
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const run = runPipeline({
      tabId: 'test-text',
      title: fixture.title,
      task: fixture.task,
      controls: fixture.controls,
      sources: fixture.sources,
    });

    expect(run.envelope.index.entries.length).toBeGreaterThan(0);
    expect(['keep', 'omit-header', 'summarize', 'hard-drop']).toContain(run.envelope.degrade_stage_label);
    expect(run.steps.some((s) => s.stage === 'budget')).toBe(true);
  });

  it('warns when vision assets are forced through text-only capability', () => {
    const fixture = fixtures.find((f) => f.slug === 'vision-flow');
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const textOnly = runPipeline({
      tabId: 'vision-text',
      title: fixture.title,
      task: fixture.task,
      controls: { ...fixture.controls, capabilityPath: 'text-only' },
      sources: fixture.sources,
    });

    expect(textOnly.warnings.some((w) => w.includes('Text-only path'))).toBe(true);
    expect(textOnly.envelope.attachments.every((a) => !a.included)).toBe(true);

    const vision = runPipeline({
      tabId: 'vision-native',
      title: fixture.title,
      task: fixture.task,
      controls: fixture.controls,
      sources: fixture.sources,
    });

    expect(vision.envelope.attachments.some((a) => a.included)).toBe(true);
    expect(vision.envelope.capability_path).toBe('vision');
  });

  it('keeps raw PDF bytes for native-doc capability and tracks pages', () => {
    const fixture = fixtures.find((f) => f.slug === 'pdf-flow');
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const run = runPipeline({
      tabId: 'pdf-doc',
      title: fixture.title,
      task: fixture.task,
      controls: fixture.controls,
      sources: fixture.sources,
    });

    expect(run.envelope.capability_path).toBe('native-doc');
    expect(run.envelope.attachments.some((a) => a.artifact_type === 'raw_pdf' && a.included)).toBe(true);
    expect(run.envelope.index.entries[0]?.pages_attached?.length).toBeGreaterThan(0);
  });

  it('creates custom notes from intermediate steps', () => {
    const tab = initializeTabs([fixtures[0]])[0];
    const stepId = tab.lastRun.steps[0].step_id;
    const note = createNoteFromStep(tab, stepId);
    expect(note.content).toContain(stepId);
    expect(note.title.toLowerCase()).toContain('note');
  });
});
