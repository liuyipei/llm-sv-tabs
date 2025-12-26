import { safeStorage, ipcMain } from 'electron';

/**
 * Secure Storage Service
 *
 * Provides encryption/decryption for sensitive data using Electron's safeStorage API.
 * This uses the operating system's credential manager:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API (if available) or libsecret
 */
export class SecureStorageService {
  private isEncryptionAvailable: boolean;

  constructor() {
    // Check if encryption is available on this system
    this.isEncryptionAvailable = safeStorage.isEncryptionAvailable();
    
    if (!this.isEncryptionAvailable) {
      console.warn('⚠️ SecureStorage: Encryption not available on this system. API keys will be stored in plaintext.');
    }
  }

  /**
   * Encrypt sensitive data (e.g., API keys)
   */
  encryptString(plaintext: string): Buffer {
    if (!this.isEncryptionAvailable) {
      // If encryption is not available, store as buffer (plaintext)
      return Buffer.from(plaintext, 'utf-8');
    }

    try {
      return safeStorage.encryptString(plaintext);
    } catch (error) {
      console.error('SecureStorage: Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt sensitive data
   * Handles migration from plaintext storage when encryption becomes available
   */
  decryptString(encryptedBuffer: Buffer): string {
    if (!this.isEncryptionAvailable) {
      // If encryption is not available, treat as plaintext
      return encryptedBuffer.toString('utf-8');
    }

    try {
      return safeStorage.decryptString(encryptedBuffer);
    } catch (error) {
      // Check if this is plaintext data stored before encryption was available
      // This handles migration: data stored as plaintext, now encryption is available
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not appear to be encrypted') ||
          errorMessage.includes('Ciphertext')) {
        console.warn('SecureStorage: Data appears to be unencrypted (legacy storage). Reading as plaintext.');
        return encryptedBuffer.toString('utf-8');
      }

      console.error('SecureStorage: Decryption failed:', error);
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return this.isEncryptionAvailable;
  }

  /**
   * Encrypt an object's string values (for Record<string, string> type data)
   * Returns an object with encrypted buffers as values
   */
  encryptRecord(record: Record<string, string>): Record<string, Buffer> {
    const encrypted: Record<string, Buffer> = {};
    for (const [key, value] of Object.entries(record)) {
      encrypted[key] = this.encryptString(value);
    }
    return encrypted;
  }

  /**
   * Decrypt an object's buffer values
   * Returns an object with decrypted strings as values
   */
  decryptRecord(encryptedRecord: Record<string, Buffer>): Record<string, string> {
    const decrypted: Record<string, string> = {};
    for (const [key, buffer] of Object.entries(encryptedRecord)) {
      decrypted[key] = this.decryptString(buffer);
    }
    return decrypted;
  }
}

// Singleton instance
let secureStorageService: SecureStorageService | null = null;

export function getSecureStorage(): SecureStorageService {
  if (!secureStorageService) {
    secureStorageService = new SecureStorageService();
  }
  return secureStorageService;
}

/**
 * Set up IPC handlers for secure storage operations
 * These allow the renderer process to request encryption/decryption
 */
export function registerSecureStorageHandlers(): void {
  const secureStorage = getSecureStorage();

  ipcMain.handle('secure-storage-encrypt', (_event, data: Record<string, string>) => {
    try {
      // Encrypt the record and convert buffers to base64 for JSON serialization
      const encryptedRecord = secureStorage.encryptRecord(data);
      const serialized: Record<string, string> = {};
      for (const [key, buffer] of Object.entries(encryptedRecord)) {
        serialized[key] = buffer.toString('base64');
      }
      return { success: true, data: serialized };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('secure-storage-decrypt', (_event, data: Record<string, string>) => {
    try {
      // Deserialize base64 strings back to buffers and decrypt
      const encryptedRecord: Record<string, Buffer> = {};
      for (const [key, base64] of Object.entries(data)) {
        encryptedRecord[key] = Buffer.from(base64, 'base64');
      }
      const decryptedRecord = secureStorage.decryptRecord(encryptedRecord);
      return { success: true, data: decryptedRecord };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('secure-storage-is-available', () => {
    return secureStorage.isAvailable();
  });
}
