/**
 * Unit tests for tiling logic
 */

import { describe, it, expect } from 'vitest';
import {
  calculateScrollStep,
  calculateScrollPositions,
  estimateTileCount,
  estimateTokensForTiles,
  checkCaptureWarning,
  validateConfig,
  createTileMetadata,
  formatTileLabel,
  generateCaptureId,
  DEFAULT_CONFIG,
} from '../src/main/services/tiling';

describe('calculateScrollStep', () => {
  it('calculates correct step for 15% overlap', () => {
    const step = calculateScrollStep(900, 0.15);
    expect(step).toBe(765); // 900 * 0.85 = 765
  });

  it('calculates correct step for 10% overlap', () => {
    const step = calculateScrollStep(900, 0.1);
    expect(step).toBe(810); // 900 * 0.9 = 810
  });

  it('calculates correct step for 20% overlap', () => {
    const step = calculateScrollStep(900, 0.2);
    expect(step).toBe(720); // 900 * 0.8 = 720
  });
});

describe('calculateScrollPositions', () => {
  it('returns single position for short page', () => {
    const positions = calculateScrollPositions(0, 900, 0.15);
    expect(positions).toEqual([0]);
  });

  it('calculates correct positions for multi-page content', () => {
    // 2000px document, 900px viewport = 1100px max scroll
    // Step = 765px, so positions should be: 0, 765, 1100
    const positions = calculateScrollPositions(1100, 900, 0.15);
    expect(positions).toEqual([0, 765, 1100]);
  });

  it('includes final position at maxScrollY', () => {
    const positions = calculateScrollPositions(2000, 900, 0.15);
    expect(positions[positions.length - 1]).toBe(2000);
  });

  it('starts at 0', () => {
    const positions = calculateScrollPositions(5000, 900, 0.15);
    expect(positions[0]).toBe(0);
  });
});

describe('estimateTileCount', () => {
  it('returns 1 for content smaller than viewport', () => {
    expect(estimateTileCount(500, 900, 0.15)).toBe(1);
    expect(estimateTileCount(900, 900, 0.15)).toBe(1);
  });

  it('estimates correct count for longer pages', () => {
    // 2000px doc, 900px viewport = 1100px scroll
    // Step = 765, so 1100/765 = 1.44, ceil = 2, +1 = 3
    expect(estimateTileCount(2000, 900, 0.15)).toBe(3);
  });
});

describe('estimateTokensForTiles', () => {
  it('estimates ~1000 tokens per standard tile', () => {
    const tokens = estimateTokensForTiles(1, { width: 1440, height: 900 });
    expect(tokens).toBe(1000);
  });

  it('scales with tile count', () => {
    const tokens = estimateTokensForTiles(10, { width: 1440, height: 900 });
    expect(tokens).toBe(10000);
  });

  it('scales with viewport size', () => {
    const standardTokens = estimateTokensForTiles(1, { width: 1440, height: 900 });
    const largerTokens = estimateTokensForTiles(1, { width: 1920, height: 1080 });
    expect(largerTokens).toBeGreaterThan(standardTokens);
  });
});

describe('checkCaptureWarning', () => {
  it('returns null when under limits', () => {
    expect(checkCaptureWarning(5, 5000)).toBeNull();
    expect(checkCaptureWarning(19, 31000)).toBeNull();
  });

  it('warns at tile limit multiples', () => {
    const warning20 = checkCaptureWarning(20, 10000);
    expect(warning20).toEqual({ type: 'tile_limit', count: 20 });

    const warning40 = checkCaptureWarning(40, 20000);
    expect(warning40).toEqual({ type: 'tile_limit', count: 40 });
  });

  it('warns at token limit', () => {
    const warning = checkCaptureWarning(30, 32000);
    expect(warning).toEqual({ type: 'token_limit', estimated: 32000 });
  });

  it('prioritizes token limit over tile limit', () => {
    const warning = checkCaptureWarning(40, 35000);
    expect(warning?.type).toBe('token_limit');
  });

  it('respects custom limits', () => {
    const warning = checkCaptureWarning(10, 5000, 10, 10000);
    expect(warning).toEqual({ type: 'tile_limit', count: 10 });
  });
});

describe('validateConfig', () => {
  it('accepts valid config', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it('rejects invalid viewport width', () => {
    const errors = validateConfig({
      viewport: { width: 100, height: 900 },
      overlapRatio: 0.15,
    });
    expect(errors).toContain('Viewport width must be between 320 and 3840');
  });

  it('rejects invalid viewport height', () => {
    const errors = validateConfig({
      viewport: { width: 1440, height: 100 },
      overlapRatio: 0.15,
    });
    expect(errors).toContain('Viewport height must be between 240 and 2160');
  });

  it('rejects invalid overlap ratio', () => {
    const errors = validateConfig({
      viewport: { width: 1440, height: 900 },
      overlapRatio: 0.05,
    });
    expect(errors).toContain('Overlap ratio must be between 0.10 and 0.20');
  });
});

describe('createTileMetadata', () => {
  it('creates correct metadata structure', () => {
    const meta = createTileMetadata(
      0,
      10,
      0,
      DEFAULT_CONFIG,
      'test-123',
      'https://example.com',
      2
    );

    expect(meta.tile_index).toBe(0);
    expect(meta.tile_count).toBe(10);
    expect(meta.scroll_y_px).toBe(0);
    expect(meta.viewport_px).toBe('1440x900');
    expect(meta.overlap_ratio).toBe(0.15);
    expect(meta.capture_id).toBe('test-123');
    expect(meta.url).toBe('https://example.com');
    expect(meta.device_pixel_ratio).toBe(2);
    expect(typeof meta.timestamp).toBe('number');
  });
});

describe('formatTileLabel', () => {
  it('formats label correctly', () => {
    const meta = createTileMetadata(
      2,
      12,
      1530,
      DEFAULT_CONFIG,
      'abc123',
      'https://example.com/page'
    );

    const label = formatTileLabel(meta);

    expect(label).toContain('[Tile 03/12]');
    expect(label).toContain('url=https://example.com/page');
    expect(label).toContain('scroll_y_px=1530');
    expect(label).toContain('viewport=1440x900');
    expect(label).toContain('overlap=0.15');
    expect(label).toContain('capture_id=abc123');
  });
});

describe('generateCaptureId', () => {
  it('generates unique IDs', () => {
    const id1 = generateCaptureId();
    const id2 = generateCaptureId();
    expect(id1).not.toBe(id2);
  });

  it('generates IDs with timestamp and random components', () => {
    const id = generateCaptureId();
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.viewport.width).toBe(1440);
    expect(DEFAULT_CONFIG.viewport.height).toBe(900);
    expect(DEFAULT_CONFIG.overlapRatio).toBe(0.15);
  });
});
