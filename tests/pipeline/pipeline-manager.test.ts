/**
 * Pipeline Manager Tests
 *
 * Tests for the PipelineManager orchestration service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineManager } from '../../src/main/services/pipeline/pipeline-manager';
import type { SourceId } from '../../src/types/context-ir';
import type { SourceInfo, PipelineStage } from '../../src/types/pipeline';

describe('PipelineManager', () => {
  let manager: PipelineManager;
  const testSourceId: SourceId = 'src:test1234';
  const testSourceInfo: SourceInfo = {
    title: 'Test Page',
    url: 'https://example.com/test',
    type: 'webpage',
    tab_id: 'tab-1',
  };

  beforeEach(() => {
    manager = new PipelineManager();
  });

  describe('createPipeline', () => {
    it('creates a new pipeline', () => {
      const pipeline = manager.createPipeline(testSourceId, testSourceInfo);

      expect(pipeline).toBeDefined();
      expect(pipeline.source_id).toBe(testSourceId);
      expect(pipeline.source_info).toEqual(testSourceInfo);
    });

    it('creates pipeline with empty stages', () => {
      const pipeline = manager.createPipeline(testSourceId, testSourceInfo);

      expect(pipeline.stages.capture).toHaveLength(0);
      expect(pipeline.stages.render).toHaveLength(0);
      expect(pipeline.stages.extract).toHaveLength(0);
    });

    it('creates pipeline in idle state', () => {
      const pipeline = manager.createPipeline(testSourceId, testSourceInfo);
      expect(pipeline.status).toEqual({ state: 'idle' });
    });

    it('stores pipeline for later retrieval', () => {
      manager.createPipeline(testSourceId, testSourceInfo);
      const retrieved = manager.getPipeline(testSourceId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.source_id).toBe(testSourceId);
    });
  });

  describe('getPipeline', () => {
    it('returns undefined for non-existent pipeline', () => {
      const result = manager.getPipeline('src:nonexist' as SourceId);
      expect(result).toBeUndefined();
    });

    it('returns existing pipeline', () => {
      const created = manager.createPipeline(testSourceId, testSourceInfo);
      const retrieved = manager.getPipeline(testSourceId);

      expect(retrieved).toBe(created);
    });
  });

  describe('getAllPipelines', () => {
    it('returns empty array when no pipelines exist', () => {
      const all = manager.getAllPipelines();
      expect(all).toEqual([]);
    });

    it('returns all created pipelines', () => {
      manager.createPipeline('src:first111' as SourceId, { title: 'First', type: 'webpage' });
      manager.createPipeline('src:second22' as SourceId, { title: 'Second', type: 'pdf' });
      manager.createPipeline('src:third333' as SourceId, { title: 'Third', type: 'image' });

      const all = manager.getAllPipelines();
      expect(all).toHaveLength(3);
    });
  });

  describe('deletePipeline', () => {
    it('returns false for non-existent pipeline', () => {
      const result = manager.deletePipeline('src:nonexist' as SourceId);
      expect(result).toBe(false);
    });

    it('returns true and removes existing pipeline', () => {
      manager.createPipeline(testSourceId, testSourceInfo);
      const result = manager.deletePipeline(testSourceId);

      expect(result).toBe(true);
      expect(manager.getPipeline(testSourceId)).toBeUndefined();
    });
  });

  describe('runPipeline', () => {
    it('throws error for non-existent pipeline', async () => {
      await expect(
        manager.runPipeline({ sourceId: 'src:nonexist' as SourceId, tabId: 'tab-1' })
      ).rejects.toThrow('Pipeline not found');
    });

    it('runs all stages by default', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const result = await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      expect(result.stages.capture.length).toBeGreaterThan(0);
      expect(result.stages.render.length).toBeGreaterThan(0);
      expect(result.stages.extract.length).toBeGreaterThan(0);
    });

    it('runs only specified stages', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const result = await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture'],
      });

      expect(result.stages.capture.length).toBeGreaterThan(0);
      expect(result.stages.render).toHaveLength(0);
      expect(result.stages.extract).toHaveLength(0);
    });

    it('sets status to complete on success', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const result = await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      expect(result.status.state).toBe('complete');
      if (result.status.state === 'complete') {
        expect(result.status.completed_at).toBeGreaterThan(0);
      }
    });

    it('calls progress callback during execution', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const progressCalls: { progress: number; message?: string }[] = [];

      await manager.runPipeline(
        {
          sourceId: testSourceId,
          tabId: 'tab-1',
        },
        (progress, message) => {
          progressCalls.push({ progress, message });
        }
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1].progress).toBe(1);
    });

    it('updates pipeline in storage after each stage', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture'],
      });

      const updated = manager.getPipeline(testSourceId);
      expect(updated?.stages.capture.length).toBeGreaterThan(0);
    });
  });

  describe('regenerateStage', () => {
    it('throws error for non-existent pipeline', async () => {
      await expect(
        manager.regenerateStage({
          sourceId: 'src:nonexist' as SourceId,
          stage: 'capture',
        })
      ).rejects.toThrow('Pipeline not found');
    });

    it('regenerates specified stage', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      // First run to populate stages
      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      const initialCaptures = manager.getPipeline(testSourceId)?.stages.capture.length ?? 0;

      // Regenerate
      const newArtifacts = await manager.regenerateStage({
        sourceId: testSourceId,
        stage: 'capture',
      });

      expect(newArtifacts.length).toBeGreaterThan(0);
      expect(newArtifacts[0].stage).toBe('capture');

      // Should have added new artifacts
      const updatedCaptures = manager.getPipeline(testSourceId)?.stages.capture.length ?? 0;
      expect(updatedCaptures).toBeGreaterThan(initialCaptures);
    });

    it('returns artifacts with correct stage type', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);
      await manager.runPipeline({ sourceId: testSourceId, tabId: 'tab-1' });

      const captureArtifacts = await manager.regenerateStage({
        sourceId: testSourceId,
        stage: 'capture',
      });
      expect(captureArtifacts.every((a) => a.stage === 'capture')).toBe(true);

      const extractArtifacts = await manager.regenerateStage({
        sourceId: testSourceId,
        stage: 'extract',
      });
      expect(extractArtifacts.every((a) => a.stage === 'extract')).toBe(true);
    });
  });

  describe('getStageOptions', () => {
    it('throws error for non-existent pipeline', () => {
      expect(() =>
        manager.getStageOptions('src:nonexist' as SourceId, 'capture')
      ).toThrow('Pipeline not found');
    });

    it('returns capture stage options', () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const options = manager.getStageOptions(testSourceId, 'capture') as {
        stage: string;
        options: { available_types: string[] };
      };

      expect(options.stage).toBe('capture');
      expect(options.options.available_types).toContain('screenshot');
      expect(options.options.available_types).toContain('text');
    });

    it('returns render stage options', () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const options = manager.getStageOptions(testSourceId, 'render') as {
        stage: string;
        options: { dpi_options: number[]; formats: string[] };
      };

      expect(options.stage).toBe('render');
      expect(options.options.dpi_options).toContain(150);
      expect(options.options.formats).toContain('png');
    });

    it('returns extract stage options', () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      const options = manager.getStageOptions(testSourceId, 'extract') as {
        stage: string;
        options: { available_types: string[]; vision_available: boolean };
      };

      expect(options.stage).toBe('extract');
      expect(options.options.available_types).toContain('readability');
      expect(options.options.vision_available).toBe(true);
    });
  });

  describe('Artifact Provenance', () => {
    it('capture artifacts have no parent IDs', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture'],
      });

      const pipeline = manager.getPipeline(testSourceId);
      const capture = pipeline?.stages.capture[0];

      expect(capture?.provenance.parent_ids).toEqual([]);
    });

    it('render artifacts reference capture parent', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture', 'render'],
      });

      const pipeline = manager.getPipeline(testSourceId);
      const capture = pipeline?.stages.capture[0];
      const render = pipeline?.stages.render[0];

      expect(render?.provenance.parent_ids).toContain(capture?.artifact_id);
    });

    it('extract artifacts reference parent artifacts', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      const pipeline = manager.getPipeline(testSourceId);
      const extract = pipeline?.stages.extract[0];

      expect(extract?.provenance.parent_ids.length).toBeGreaterThan(0);
    });

    it('artifacts track method and version', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      const pipeline = manager.getPipeline(testSourceId);

      for (const stage of ['capture', 'render', 'extract'] as const) {
        const artifact = pipeline?.stages[stage][0];
        expect(artifact?.provenance.method).toBeDefined();
        expect(artifact?.provenance.version).toBeDefined();
      }
    });

    it('artifacts track duration', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
      });

      const pipeline = manager.getPipeline(testSourceId);

      for (const stage of ['capture', 'render', 'extract'] as const) {
        const artifact = pipeline?.stages[stage][0];
        expect(artifact?.provenance.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Pipeline State Management', () => {
    it('updates pipeline timestamps', async () => {
      const pipeline = manager.createPipeline(testSourceId, testSourceInfo);
      const createdAt = pipeline.created_at;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture'],
      });

      const updated = manager.getPipeline(testSourceId);
      expect(updated?.created_at).toBe(createdAt);
      expect(updated?.updated_at).toBeGreaterThan(createdAt);
    });

    it('preserves existing artifacts when adding new ones', async () => {
      manager.createPipeline(testSourceId, testSourceInfo);

      // Run capture
      await manager.runPipeline({
        sourceId: testSourceId,
        tabId: 'tab-1',
        stages: ['capture'],
      });

      const firstCapture = manager.getPipeline(testSourceId)?.stages.capture[0];

      // Regenerate capture
      await manager.regenerateStage({
        sourceId: testSourceId,
        stage: 'capture',
      });

      const pipeline = manager.getPipeline(testSourceId);
      expect(pipeline?.stages.capture).toContain(firstCapture);
      expect(pipeline?.stages.capture.length).toBeGreaterThan(1);
    });
  });
});
