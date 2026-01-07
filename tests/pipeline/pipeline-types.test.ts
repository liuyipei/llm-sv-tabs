/**
 * Pipeline Types Tests
 *
 * Tests for pipeline type definitions and utility functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createArtifactId,
  createEmptyPipeline,
  createEmptySelection,
  getArtifactsForStage,
  isArtifactOfStage,
  PIPELINE_STAGES,
  type SourcePipeline,
  type CaptureArtifact,
  type RenderArtifact,
  type ExtractArtifact,
  type PipelineStage,
  type SourceInfo,
} from '../../src/types/pipeline';
import type { SourceId, Anchor, BinaryBlob } from '../../src/types/context-ir';

describe('Pipeline Types', () => {
  describe('createArtifactId', () => {
    it('generates valid UUID v4 format', () => {
      const id = createArtifactId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(id).toMatch(uuidRegex);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createArtifactId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createEmptySelection', () => {
    it('creates selection with empty artifact_ids set', () => {
      const selection = createEmptySelection();

      expect(selection.artifact_ids).toBeInstanceOf(Set);
      expect(selection.artifact_ids.size).toBe(0);
    });

    it('creates selection in auto mode', () => {
      const selection = createEmptySelection();
      expect(selection.mode).toBe('auto');
    });

    it('creates selection with zero tokens', () => {
      const selection = createEmptySelection();
      expect(selection.estimated_tokens).toBe(0);
    });

    it('creates selection with recent modified_at timestamp', () => {
      const before = Date.now();
      const selection = createEmptySelection();
      const after = Date.now();

      expect(selection.modified_at).toBeGreaterThanOrEqual(before);
      expect(selection.modified_at).toBeLessThanOrEqual(after);
    });
  });

  describe('createEmptyPipeline', () => {
    const sourceId: SourceId = 'src:abcd1234';
    const sourceInfo: SourceInfo = {
      title: 'Test Page',
      url: 'https://example.com',
      type: 'webpage',
      tab_id: 'tab-123',
    };

    it('creates pipeline with correct source_id', () => {
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);
      expect(pipeline.source_id).toBe(sourceId);
    });

    it('creates pipeline with correct source_info', () => {
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);
      expect(pipeline.source_info).toEqual(sourceInfo);
    });

    it('creates pipeline with empty stage arrays', () => {
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);

      expect(pipeline.stages.capture).toEqual([]);
      expect(pipeline.stages.render).toEqual([]);
      expect(pipeline.stages.extract).toEqual([]);
    });

    it('creates pipeline with empty selection', () => {
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);

      expect(pipeline.selection.artifact_ids.size).toBe(0);
      expect(pipeline.selection.mode).toBe('auto');
    });

    it('creates pipeline in idle state', () => {
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);
      expect(pipeline.status).toEqual({ state: 'idle' });
    });

    it('creates pipeline with valid timestamps', () => {
      const before = Date.now();
      const pipeline = createEmptyPipeline(sourceId, sourceInfo);
      const after = Date.now();

      expect(pipeline.created_at).toBeGreaterThanOrEqual(before);
      expect(pipeline.created_at).toBeLessThanOrEqual(after);
      expect(pipeline.updated_at).toBe(pipeline.created_at);
    });
  });

  describe('PIPELINE_STAGES', () => {
    it('contains all three stages in order', () => {
      expect(PIPELINE_STAGES).toEqual(['capture', 'render', 'extract']);
    });

    it('is defined as const array', () => {
      // TypeScript's `as const` makes it readonly at compile time
      // Runtime check: array should have expected length and values
      expect(PIPELINE_STAGES.length).toBe(3);
      expect([...PIPELINE_STAGES]).toEqual(['capture', 'render', 'extract']);
    });
  });

  describe('getArtifactsForStage', () => {
    let pipeline: SourcePipeline;

    beforeEach(() => {
      pipeline = createEmptyPipeline('src:test1234', {
        title: 'Test',
        type: 'webpage',
      });
    });

    it('returns empty array for empty stage', () => {
      const artifacts = getArtifactsForStage(pipeline, 'capture');
      expect(artifacts).toEqual([]);
    });

    it('returns artifacts for capture stage', () => {
      const captureArtifact: CaptureArtifact = createMockCaptureArtifact();
      pipeline.stages.capture = [captureArtifact];

      const artifacts = getArtifactsForStage(pipeline, 'capture');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toBe(captureArtifact);
    });

    it('returns artifacts for render stage', () => {
      const renderArtifact: RenderArtifact = createMockRenderArtifact();
      pipeline.stages.render = [renderArtifact];

      const artifacts = getArtifactsForStage(pipeline, 'render');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toBe(renderArtifact);
    });

    it('returns artifacts for extract stage', () => {
      const extractArtifact: ExtractArtifact = createMockExtractArtifact();
      pipeline.stages.extract = [extractArtifact];

      const artifacts = getArtifactsForStage(pipeline, 'extract');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toBe(extractArtifact);
    });
  });

  describe('isArtifactOfStage', () => {
    it('returns true for matching capture stage', () => {
      const artifact = createMockCaptureArtifact();
      expect(isArtifactOfStage(artifact, 'capture')).toBe(true);
    });

    it('returns false for non-matching capture stage', () => {
      const artifact = createMockCaptureArtifact();
      expect(isArtifactOfStage(artifact, 'render')).toBe(false);
      expect(isArtifactOfStage(artifact, 'extract')).toBe(false);
    });

    it('returns true for matching render stage', () => {
      const artifact = createMockRenderArtifact();
      expect(isArtifactOfStage(artifact, 'render')).toBe(true);
    });

    it('returns false for non-matching render stage', () => {
      const artifact = createMockRenderArtifact();
      expect(isArtifactOfStage(artifact, 'capture')).toBe(false);
      expect(isArtifactOfStage(artifact, 'extract')).toBe(false);
    });

    it('returns true for matching extract stage', () => {
      const artifact = createMockExtractArtifact();
      expect(isArtifactOfStage(artifact, 'extract')).toBe(true);
    });

    it('returns false for non-matching extract stage', () => {
      const artifact = createMockExtractArtifact();
      expect(isArtifactOfStage(artifact, 'capture')).toBe(false);
      expect(isArtifactOfStage(artifact, 'render')).toBe(false);
    });
  });
});

describe('Artifact Types', () => {
  describe('CaptureArtifact', () => {
    it('has correct stage type', () => {
      const artifact = createMockCaptureArtifact();
      expect(artifact.stage).toBe('capture');
    });

    it('can hold screenshot data', () => {
      const artifact = createMockCaptureArtifact('screenshot');
      expect(artifact.capture_type).toBe('screenshot');
      expect(artifact.mime_type).toBe('image/png');
    });

    it('can hold text data', () => {
      const artifact = createMockCaptureArtifact('text');
      expect(artifact.capture_type).toBe('text');
      expect(typeof artifact.data).toBe('string');
    });
  });

  describe('RenderArtifact', () => {
    it('has correct stage type', () => {
      const artifact = createMockRenderArtifact();
      expect(artifact.stage).toBe('render');
    });

    it('contains rendered pages', () => {
      const artifact = createMockRenderArtifact();
      expect(artifact.pages).toBeInstanceOf(Array);
      expect(artifact.page_count).toBe(artifact.pages.length);
    });

    it('has render configuration', () => {
      const artifact = createMockRenderArtifact();
      expect(artifact.render_config).toBeDefined();
      expect(artifact.render_config.format).toBe('png');
    });
  });

  describe('ExtractArtifact', () => {
    it('has correct stage type', () => {
      const artifact = createMockExtractArtifact();
      expect(artifact.stage).toBe('extract');
    });

    it('contains extracted text', () => {
      const artifact = createMockExtractArtifact();
      expect(typeof artifact.text).toBe('string');
      expect(artifact.text.length).toBeGreaterThan(0);
    });

    it('has quality assessment', () => {
      const artifact = createMockExtractArtifact();
      expect(['good', 'mixed', 'low', 'ocr_like']).toContain(artifact.quality);
    });

    it('has token estimate', () => {
      const artifact = createMockExtractArtifact();
      expect(artifact.token_estimate).toBeGreaterThan(0);
      // Token estimate should be roughly text.length / 4 (using ceil)
      const expectedTokens = Math.ceil(artifact.char_count / 4);
      expect(artifact.token_estimate).toBe(expectedTokens);
    });
  });
});

describe('ArtifactProvenance', () => {
  it('tracks method and version', () => {
    const artifact = createMockCaptureArtifact();
    expect(artifact.provenance.method).toBe('mock_capture');
    expect(artifact.provenance.version).toBe('1.0.0');
  });

  it('tracks parent IDs for derived artifacts', () => {
    const capture = createMockCaptureArtifact();
    const render = createMockRenderArtifact([capture.artifact_id]);

    expect(render.provenance.parent_ids).toContain(capture.artifact_id);
  });

  it('tracks duration', () => {
    const artifact = createMockCaptureArtifact();
    expect(artifact.provenance.duration_ms).toBeDefined();
    expect(artifact.provenance.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('Pipeline Status', () => {
  it('can represent idle state', () => {
    const pipeline = createEmptyPipeline('src:test', { title: 'Test', type: 'webpage' });
    expect(pipeline.status.state).toBe('idle');
  });

  it('can represent running state', () => {
    const pipeline = createEmptyPipeline('src:test', { title: 'Test', type: 'webpage' });
    pipeline.status = { state: 'running', stage: 'capture', progress: 0.5 };

    expect(pipeline.status.state).toBe('running');
    if (pipeline.status.state === 'running') {
      expect(pipeline.status.stage).toBe('capture');
      expect(pipeline.status.progress).toBe(0.5);
    }
  });

  it('can represent complete state', () => {
    const pipeline = createEmptyPipeline('src:test', { title: 'Test', type: 'webpage' });
    pipeline.status = { state: 'complete', completed_at: Date.now() };

    expect(pipeline.status.state).toBe('complete');
    if (pipeline.status.state === 'complete') {
      expect(pipeline.status.completed_at).toBeGreaterThan(0);
    }
  });

  it('can represent error state', () => {
    const pipeline = createEmptyPipeline('src:test', { title: 'Test', type: 'webpage' });
    pipeline.status = {
      state: 'error',
      stage: 'render',
      error: 'Failed to render',
      recoverable: true,
    };

    expect(pipeline.status.state).toBe('error');
    if (pipeline.status.state === 'error') {
      expect(pipeline.status.stage).toBe('render');
      expect(pipeline.status.error).toBe('Failed to render');
      expect(pipeline.status.recoverable).toBe(true);
    }
  });
});

// Helper functions to create mock artifacts

function createMockCaptureArtifact(type: 'screenshot' | 'text' = 'text'): CaptureArtifact {
  const base = {
    artifact_id: createArtifactId(),
    stage: 'capture' as const,
    source_anchor: 'src:mock1234' as Anchor,
    created_at: Date.now(),
    provenance: {
      method: 'mock_capture',
      version: '1.0.0',
      parent_ids: [],
      duration_ms: 100,
    },
    selected: false,
    source_uri: 'https://example.com',
  };

  if (type === 'screenshot') {
    return {
      ...base,
      capture_type: 'screenshot',
      data: { data: '', mime_type: 'image/png', byte_size: 0 } as BinaryBlob,
      mime_type: 'image/png',
      dimensions: { width: 1920, height: 1080 },
    };
  }

  return {
    ...base,
    capture_type: 'text',
    data: 'Mock captured text content',
    mime_type: 'text/plain',
  };
}

function createMockRenderArtifact(parentIds: string[] = []): RenderArtifact {
  return {
    artifact_id: createArtifactId(),
    stage: 'render',
    source_anchor: 'src:mock1234' as Anchor,
    created_at: Date.now(),
    provenance: {
      method: 'mock_render',
      version: '1.0.0',
      parent_ids: parentIds,
      duration_ms: 200,
    },
    selected: false,
    render_type: 'rasterized_pages',
    pages: [
      {
        page_number: 1,
        image: { data: '', mime_type: 'image/png', byte_size: 0 },
        anchor: 'src:mock1234#p=1' as Anchor,
        dimensions: { width: 612, height: 792 },
      },
    ],
    render_config: {
      dpi: 150,
      format: 'png',
    },
    page_count: 1,
  };
}

function createMockExtractArtifact(parentIds: string[] = []): ExtractArtifact {
  const text = 'Mock extracted text content for testing purposes.';
  return {
    artifact_id: createArtifactId(),
    stage: 'extract',
    source_anchor: 'src:mock1234' as Anchor,
    created_at: Date.now(),
    provenance: {
      method: 'mock_extract',
      version: '1.0.0',
      parent_ids: parentIds,
      duration_ms: 50,
    },
    selected: false,
    extract_type: 'readability',
    text,
    quality: 'good',
    token_estimate: Math.ceil(text.length / 4),
    char_count: text.length,
  };
}
