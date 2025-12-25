import { writable, type Writable } from 'svelte/store';

/**
 * Create a persisted store that securely encrypts sensitive data before storing.
 * Uses Electron's safeStorage API via IPC for encryption/decryption.
 */
export function createSecurePersistedStore<T extends Record<string, string>>(
  key: string,
  initial: T
): Writable<T> {
  const isBrowser = typeof window !== 'undefined';
  const electronAPI = (window as any).electronAPI;

  // Load initial value from localStorage
  let initialValue = initial;
  
  // Async initialization function
  const initializeStore = async (storeSet: (value: T) => void) => {
    if (isBrowser && electronAPI) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const encryptedData = JSON.parse(stored);
          
          // Check if encryption is available
          if (electronAPI.isSecureStorageAvailable?.()) {
            // Decrypt the data
            const result = await electronAPI.decryptSecureData?.(encryptedData);
            if (result?.success && result.data) {
              storeSet(result.data as T);
              return;
            } else {
              console.warn(`Failed to decrypt stored value for ${key}`);
            }
          } else {
            // Encryption not available, treat as plaintext (for backward compatibility)
            storeSet(encryptedData as T);
            return;
          }
        } catch (e) {
          console.warn(`Failed to parse/decrypt stored value for ${key}`, e);
        }
      }
    }
  };

  // Create the base writable store with initial value
  const { subscribe, set, update } = writable<T>(initialValue, (set) => {
    // Initialize the store asynchronously
    initializeStore(set);
  });

  // Return a custom store object that persists on set/update
  return {
    subscribe,
    set: async (value: T) => {
      if (isBrowser && electronAPI) {
        try {
          let dataToStore: any = value;

          // Check if encryption is available
          if (electronAPI.isSecureStorageAvailable?.()) {
            // Encrypt the data before storing
            const result = await electronAPI.encryptSecureData?.(value);
            if (result?.success && result.data) {
              dataToStore = result.data;
            } else {
              console.warn(`Failed to encrypt value for ${key}, storing plaintext`);
            }
          }

          localStorage.setItem(key, JSON.stringify(dataToStore));
        } catch (e) {
          console.error(`Failed to encrypt/store value for ${key}`, e);
          // Fallback: store plaintext if encryption fails
          localStorage.setItem(key, JSON.stringify(value));
        }
      }
      set(value);
    },
    update: async (fn: (value: T) => T) => {
      update((current) => {
        const newValue = fn(current);
        
        // Store the new value asynchronously
        if (isBrowser && electronAPI) {
          (async () => {
            try {
              let dataToStore: any = newValue;

              // Check if encryption is available
              if (electronAPI.isSecureStorageAvailable?.()) {
                // Encrypt the data before storing
                const result = await electronAPI.encryptSecureData?.(newValue);
                if (result?.success && result.data) {
                  dataToStore = result.data;
                } else {
                  console.warn(`Failed to encrypt value for ${key}, storing plaintext`);
                }
              }

              localStorage.setItem(key, JSON.stringify(dataToStore));
            } catch (e) {
              console.error(`Failed to encrypt/store value for ${key}`, e);
              // Fallback: store plaintext if encryption fails
              localStorage.setItem(key, JSON.stringify(newValue));
            }
          })();
        }

        return newValue;
      });
    }
  };
}
