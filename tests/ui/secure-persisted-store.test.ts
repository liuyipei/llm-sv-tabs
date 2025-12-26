import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  createSecurePersistedStore,
  type SecurePersistedStoreStorage,
  type SecurePersistedStoreAvailability,
  type SecurePersistedStoreCrypto,
} from '../../src/ui/utils/secure-persisted-store.js';

const createMockStorage = (): SecurePersistedStoreStorage & { data: Record<string, string | null> } => {
  const data: Record<string, string | null> = {};
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
};

  const flushMicrotasks = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

describe('createSecurePersistedStore (injectable adapters)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses injected availability + crypto to encrypt/decrypt values', async () => {
    const storage = createMockStorage();
    const availability: SecurePersistedStoreAvailability = vi.fn(async () => true);
    const crypto: SecurePersistedStoreCrypto<Record<string, string>> = {
      encrypt: vi.fn(async (data) => ({
        success: true,
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, `enc-${v}`])),
      })),
      decrypt: vi.fn(async (data) => ({
        success: true,
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, `dec-${v}`])),
      })),
    };

    // Seed encrypted data so initialization exercises decrypt
    storage.setItem('apiKeys', JSON.stringify({ openai: 'seeded' }));

    const store = createSecurePersistedStore('apiKeys', { openai: '' }, { storage, availability, crypto });
    await flushMicrotasks();

    await new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe((value) => {
        if (value.openai === 'dec-seeded') {
          unsubscribe();
          resolve();
        }
      });
      setTimeout(() => {
        unsubscribe();
        resolve();
      }, 25);
    });

    expect(get(store)).toEqual({ openai: 'dec-seeded' });
    expect(crypto.decrypt).toHaveBeenCalledTimes(1);

    await store.set({ openai: 'new-key' });
    expect(crypto.encrypt).toHaveBeenCalledTimes(1);
    expect(storage.getItem('apiKeys')).toEqual(JSON.stringify({ openai: 'enc-new-key' }));
  });

  it('falls back to plaintext when availability is false without calling crypto', async () => {
    const storage = createMockStorage();
    const availability: SecurePersistedStoreAvailability = vi.fn(() => false);
    const crypto = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    } as SecurePersistedStoreCrypto<Record<string, string>>;

    const store = createSecurePersistedStore('apiKeys', { openai: '' }, { storage, availability, crypto });

    await store.set({ openai: 'plain-key' });

    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(storage.getItem('apiKeys')).toEqual(JSON.stringify({ openai: 'plain-key' }));
    expect(get(store)).toEqual({ openai: 'plain-key' });
  });
});
