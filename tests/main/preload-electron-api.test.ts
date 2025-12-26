import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => {
  const invoke = vi.fn();
  const on = vi.fn();
  const off = vi.fn();
  const removeListener = vi.fn();
  return {
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke, on, off, removeListener },
    webUtils: { getPathForFile: vi.fn() },
  };
});

import { createElectronAPI, type IpcTransport } from '../../src/main/preload.js';

const createMockTransport = () => {
  const invoke = vi.fn(async (...args: any[]) => ({ ok: true, args }));
  const on = vi.fn();
  const off = vi.fn();
  const removeListener = vi.fn();
  const transport: IpcTransport = {
    invoke,
    on,
    off,
    removeListener,
  };
  return { transport, invoke, on, off, removeListener };
};

describe('createElectronAPI (injectable transport)', () => {
  it('routes invocations through the provided transport', async () => {
    const { transport, invoke } = createMockTransport();
    const api = createElectronAPI(transport);

    await api.openUrl('https://example.com');

    expect(invoke).toHaveBeenCalledWith('open-url', 'https://example.com');
  });

  it('wires listener helpers with transport.on/off', () => {
    const { transport, on, off } = createMockTransport();
    const api = createElectronAPI(transport);

    const noop = vi.fn();
    const unsubscribe = api.onTabCreated(noop);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0]?.[0]).toBe('tab-created');
    const handler = on.mock.calls[0]?.[1];
    expect(typeof handler).toBe('function');

    unsubscribe();
    expect(off).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledWith('tab-created', handler);
  });

  it('unsubscribes LLm chunk listener via removeListener and forwards payload', () => {
    const { transport, on, removeListener } = createMockTransport();
    const api = createElectronAPI(transport);
    const chunkHandler = vi.fn();

    const unsubscribe = api.onLLMChunk(chunkHandler);

    expect(on).toHaveBeenCalledWith('llm-stream-chunk', expect.any(Function));
    const handler = on.mock.calls.find((call) => call[0] === 'llm-stream-chunk')?.[1];
    expect(handler).toBeTruthy();

    (handler as any)(undefined, { tabId: 'tab-1', chunk: 'data' });
    expect(chunkHandler).toHaveBeenCalledWith({ tabId: 'tab-1', chunk: 'data' });

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith('llm-stream-chunk', handler);
  });
});
