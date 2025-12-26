import { writable, type Writable } from 'svelte/store';

export type SecurePersistedStoreStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SecurePersistedStoreAvailability = () => boolean | Promise<boolean>;

export type SecurePersistedStoreCrypto<T extends Record<string, string>> = {
  encrypt: (
    data: T
  ) => Promise<{ success: boolean; data?: Record<string, string>; error?: string }>;
  decrypt: (
    data: Record<string, string>
  ) => Promise<{ success: boolean; data?: T; error?: string }>;
};

export type SecurePersistedStoreAdapters<T extends Record<string, string>> = {
  storage?: SecurePersistedStoreStorage;
  availability?: SecurePersistedStoreAvailability;
  crypto?: SecurePersistedStoreCrypto<T>;
};

function getDefaultAvailability(
  isBrowser: boolean,
  electronAPI: any
): SecurePersistedStoreAvailability {
  if (!isBrowser || !electronAPI?.isSecureStorageAvailable) {
    return () => false;
  }

  return () => electronAPI.isSecureStorageAvailable();
}

function getDefaultCrypto<T extends Record<string, string>>(
  isBrowser: boolean,
  electronAPI: any
): SecurePersistedStoreCrypto<T> | undefined {
  if (!isBrowser || !electronAPI) return undefined;
  return {
    encrypt: (data: T) => electronAPI.encryptSecureData?.(data),
    decrypt: (data: Record<string, string>) => electronAPI.decryptSecureData?.(data),
  };
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in (value as any);
}

/**
 * Create a persisted store that securely encrypts sensitive data before storing.
 * Uses Electron's safeStorage API via IPC for encryption/decryption unless custom
 * adapters are provided (to enable headless/unit testing).
 */
export function createSecurePersistedStore<T extends Record<string, string>>(
  key: string,
  initial: T,
  adapters: SecurePersistedStoreAdapters<T> = {}
): Writable<T> {
  const isBrowser = typeof window !== 'undefined';
  const electronAPI = isBrowser ? (window as any).electronAPI : undefined;

  const storage = adapters.storage ?? (isBrowser ? localStorage : undefined);
  const availability =
    adapters.availability ?? getDefaultAvailability(isBrowser, electronAPI);
  const crypto = adapters.crypto ?? getDefaultCrypto<T>(isBrowser, electronAPI);

  const persistValue = (value: T): Promise<void> => {
    if (!storage) return Promise.resolve();
    try {
      const availabilityResult = availability();
      const handlePersistence = async (secureAvailable: boolean) => {
        let dataToStore: Record<string, string> | T = value;
        if (secureAvailable && crypto) {
          const result = await crypto.encrypt(value);
          if (result?.success && result.data) {
            dataToStore = result.data;
          } else {
            console.warn(`Failed to encrypt value for ${key}, storing plaintext`);
          }
        }

        storage.setItem(key, JSON.stringify(dataToStore));
      };

      if (isPromiseLike<boolean>(availabilityResult)) {
        return availabilityResult
          .then((secureAvailable) => handlePersistence(secureAvailable))
          .catch((error) => {
            console.error(`Failed to encrypt/store value for ${key}`, error);
            storage.setItem(key, JSON.stringify(value));
          });
      }

      return handlePersistence(availabilityResult);
    } catch (error) {
      console.error(`Failed to encrypt/store value for ${key}`, error);
      storage.setItem(key, JSON.stringify(value));
      return Promise.resolve();
    }
  };

  // Load initial value from storage
  let initialValue = initial;
  const initializeStore = async (storeSet: (value: T) => void) => {
    if (!storage) return;

    const stored = storage.getItem(key);
    if (!stored) return;

    try {
      const encryptedData = JSON.parse(stored);
      const availabilityResult = availability();
      const secureAvailable = isPromiseLike<boolean>(availabilityResult)
        ? await availabilityResult
        : availabilityResult;

      if (secureAvailable && crypto) {
        const result = await crypto.decrypt(encryptedData);
        if (result?.success && result.data) {
          storeSet(result.data);
          return;
        }

        console.warn(`Failed to decrypt stored value for ${key}, falling back to plaintext`);
      }

      storeSet(encryptedData as T);
    } catch (error) {
      console.warn(`Failed to parse/decrypt stored value for ${key}`, error);
    }
  };

  const { subscribe, set, update } = writable<T>(initialValue, (set) => {
    void initializeStore(set);
  });

  return {
    subscribe,
    set: async (value: T) => {
      set(value);
      await persistValue(value);
    },
    update: async (fn: (value: T) => T) => {
      let newValue: T = initial;
      update((current) => {
        newValue = fn(current);
        return newValue;
      });
      await persistValue(newValue);
    },
  };
}
