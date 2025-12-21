import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOCAL_PATH = join(process.cwd(), 'src', 'main', 'vlm-gateway', 'model-capabilities.local.json');
const mockMetadata = vi.fn();

vi.doMock('../../src/main/vlm-gateway/portkey-client', () => ({
  getPortkeyModelMetadata: (...args: unknown[]) => mockMetadata(...args),
}));

describe('vlm-gateway capabilities resolution', () => {
  let originalLocalFile: string;

  beforeAll(() => {
    originalLocalFile = readFileSync(LOCAL_PATH, 'utf-8');
  });

  afterAll(() => {
    writeFileSync(LOCAL_PATH, originalLocalFile, 'utf-8');
  });

  beforeEach(() => {
    vi.resetModules();
    mockMetadata.mockReset();
  });

  it('prefers local overrides over remote metadata', async () => {
    writeFileSync(LOCAL_PATH, JSON.stringify({
      'my-model': { supportsVision: true, supportsPdfNative: true, supportsText: true },
    }), 'utf-8');
    mockMetadata.mockResolvedValue({
      modalities: ['text'],
    });

    const { getModelCapabilities } = await import('../../src/main/vlm-gateway/capabilities');
    const caps = await getModelCapabilities({
      providerKind: 'portkey',
      model: 'my-model',
      provider: 'openai',
    });

    expect(mockMetadata).not.toHaveBeenCalled();
    expect(caps.supportsPdfNative).toBe(true);
    expect(caps.supportsVision).toBe(true);
  });

  it('falls back to Portkey metadata when no local override exists', async () => {
    writeFileSync(LOCAL_PATH, JSON.stringify({}), 'utf-8');
    mockMetadata.mockResolvedValue({
      modalities: ['text', 'image'],
      maxInputTokens: 8192,
    });

    const { getModelCapabilities } = await import('../../src/main/vlm-gateway/capabilities');
    const caps = await getModelCapabilities({
      providerKind: 'portkey',
      model: 'vision-model',
      provider: 'openai',
    });

    expect(mockMetadata).toHaveBeenCalledOnce();
    expect(caps.supportsVision).toBe(true);
    expect(caps.maxInputTokens).toBe(8192);
  });

  it('uses provider defaults when metadata is unavailable', async () => {
    writeFileSync(LOCAL_PATH, JSON.stringify({}), 'utf-8');
    mockMetadata.mockResolvedValue(null);

    const { getModelCapabilities } = await import('../../src/main/vlm-gateway/capabilities');
    const caps = await getModelCapabilities({
      providerKind: 'portkey',
      model: 'unknown',
      provider: 'ollama',
    });

    expect(mockMetadata).toHaveBeenCalledOnce();
    expect(caps.supportsVision).toBe(false);
    expect(caps.supportsText).toBe(true);
  });
});
