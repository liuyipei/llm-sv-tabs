import { describe, it, expect } from 'vitest';
import {
  computeSourceId,
  createAnchor,
  parseAnchor,
  isValidSourceId,
  isValidAnchor,
  getSourceIdFromAnchor,
} from '../../src/main/services/context/anchor-utils';
import type { SourceId, Anchor } from '../../src/types/context-ir';

describe('anchor-utils', () => {
  describe('computeSourceId', () => {
    it('should generate consistent source IDs for same content', () => {
      const content = { url: 'https://example.com', content: 'Hello world' };
      const id1 = computeSourceId(content);
      const id2 = computeSourceId(content);

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different URLs', () => {
      const id1 = computeSourceId({ url: 'https://example.com/a', content: 'Same' });
      const id2 = computeSourceId({ url: 'https://example.com/b', content: 'Same' });

      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different content', () => {
      const id1 = computeSourceId({ url: 'https://example.com', content: 'Content A' });
      const id2 = computeSourceId({ url: 'https://example.com', content: 'Content B' });

      expect(id1).not.toBe(id2);
    });

    it('should return format src:<8-hex-chars>', () => {
      const id = computeSourceId({ url: 'test', content: 'test' });

      expect(id).toMatch(/^src:[a-f0-9]{8}$/);
    });

    it('should handle object content', () => {
      const id = computeSourceId({
        url: 'test',
        content: { key: 'value', nested: { data: 123 } },
      });

      expect(id).toMatch(/^src:[a-f0-9]{8}$/);
    });

    it('should handle empty content', () => {
      const id = computeSourceId({ url: 'test', content: '' });

      expect(id).toMatch(/^src:[a-f0-9]{8}$/);
    });

    it('should handle missing URL', () => {
      const id = computeSourceId({ content: 'no url' });

      expect(id).toMatch(/^src:[a-f0-9]{8}$/);
    });
  });

  describe('createAnchor', () => {
    const sourceId: SourceId = 'src:12345678';

    it('should create anchor without location', () => {
      const anchor = createAnchor(sourceId);

      expect(anchor).toBe('src:12345678');
    });

    it('should create anchor with page location', () => {
      const anchor = createAnchor(sourceId, { type: 'page', page: 12 });

      expect(anchor).toBe('src:12345678#p=12');
    });

    it('should create anchor with section location', () => {
      const anchor = createAnchor(sourceId, { type: 'section', path: 'H2.3' });

      expect(anchor).toBe('src:12345678#sec=H2.3');
    });

    it('should create anchor with message location', () => {
      const anchor = createAnchor(sourceId, { type: 'message', index: 5 });

      expect(anchor).toBe('src:12345678#msg=5');
    });

    it('should create anchor with region location', () => {
      const anchor = createAnchor(sourceId, {
        type: 'region',
        x: 100,
        y: 200,
        w: 300,
        h: 400,
      });

      expect(anchor).toBe('src:12345678#r=100,200,300,400');
    });
  });

  describe('parseAnchor', () => {
    it('should parse anchor without location', () => {
      const parsed = parseAnchor('src:12345678');

      expect(parsed.source_id).toBe('src:12345678');
      expect(parsed.location).toBeUndefined();
      expect(parsed.raw_location).toBeUndefined();
    });

    it('should parse anchor with page location', () => {
      const parsed = parseAnchor('src:12345678#p=12');

      expect(parsed.source_id).toBe('src:12345678');
      expect(parsed.location).toEqual({ type: 'page', value: '12' });
      expect(parsed.raw_location).toBe('p=12');
    });

    it('should parse anchor with section location', () => {
      const parsed = parseAnchor('src:abcdef12#sec=H2.3');

      expect(parsed.source_id).toBe('src:abcdef12');
      expect(parsed.location).toEqual({ type: 'section', value: 'H2.3' });
    });

    it('should parse anchor with message location', () => {
      const parsed = parseAnchor('src:00000000#msg=42');

      expect(parsed.source_id).toBe('src:00000000');
      expect(parsed.location).toEqual({ type: 'message', value: '42' });
    });

    it('should parse anchor with region location', () => {
      const parsed = parseAnchor('src:ffffffff#r=10,20,30,40');

      expect(parsed.source_id).toBe('src:ffffffff');
      expect(parsed.location).toEqual({ type: 'region', value: '10,20,30,40' });
    });

    it('should throw for invalid anchor format', () => {
      expect(() => parseAnchor('invalid')).toThrow('must start with "src:"');
      expect(() => parseAnchor('SOURCE:12345678')).toThrow('must start with "src:"');
    });

    it('should throw for invalid source ID length', () => {
      expect(() => parseAnchor('src:123')).toThrow('hash must be 8 chars');
      expect(() => parseAnchor('src:1234567890')).toThrow('hash must be 8 chars');
    });

    it('should throw for empty location', () => {
      expect(() => parseAnchor('src:12345678#')).toThrow('empty location');
    });

    it('should handle unknown location types gracefully', () => {
      const parsed = parseAnchor('src:12345678#custom=value');

      expect(parsed.source_id).toBe('src:12345678');
      expect(parsed.location?.type).toBe('custom');
      expect(parsed.location?.value).toBe('value');
    });
  });

  describe('isValidSourceId', () => {
    it('should return true for valid source IDs', () => {
      expect(isValidSourceId('src:12345678')).toBe(true);
      expect(isValidSourceId('src:abcdef12')).toBe(true);
      expect(isValidSourceId('src:ABCDEF12')).toBe(true);
    });

    it('should return false for invalid source IDs', () => {
      expect(isValidSourceId('src:123')).toBe(false);
      expect(isValidSourceId('invalid')).toBe(false);
      expect(isValidSourceId('src:1234567g')).toBe(false);
    });
  });

  describe('isValidAnchor', () => {
    it('should return true for valid anchors', () => {
      expect(isValidAnchor('src:12345678')).toBe(true);
      expect(isValidAnchor('src:12345678#p=1')).toBe(true);
      expect(isValidAnchor('src:abcdef12#sec=H1')).toBe(true);
    });

    it('should return false for invalid anchors', () => {
      expect(isValidAnchor('invalid')).toBe(false);
      expect(isValidAnchor('src:123#p=1')).toBe(false);
      expect(isValidAnchor('src:12345678#')).toBe(false);
    });
  });

  describe('getSourceIdFromAnchor', () => {
    it('should extract source ID from anchor without location', () => {
      const anchor: Anchor = 'src:12345678';
      const sourceId = getSourceIdFromAnchor(anchor);

      expect(sourceId).toBe('src:12345678');
    });

    it('should extract source ID from anchor with location', () => {
      const anchor: Anchor = 'src:abcdef12#p=42';
      const sourceId = getSourceIdFromAnchor(anchor);

      expect(sourceId).toBe('src:abcdef12');
    });
  });
});
