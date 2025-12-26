import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for secure storage IPC handlers.
 *
 * These tests focus on the data format migration scenarios that can occur
 * when encryption availability changes between sessions.
 */

// Use vi.hoisted to create mocks that are available during module initialization
const { mockSafeStorage, mockHandlers } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
  mockHandlers: new Map<string, Function>(),
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
  },
}));

// Import after mocking
import { SecureStorageService, registerSecureStorageHandlers } from '../../src/main/services/secure-storage';

describe('SecureStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
  });

  describe('when encryption is available', () => {
    beforeEach(() => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
    });

    it('should encrypt and decrypt strings correctly', () => {
      const service = new SecureStorageService();
      const testData = 'sk-test-api-key-12345';
      const encryptedBuffer = Buffer.from('encrypted-data');

      mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);
      mockSafeStorage.decryptString.mockReturnValue(testData);

      const encrypted = service.encryptString(testData);
      expect(encrypted).toBe(encryptedBuffer);

      const decrypted = service.decryptString(encrypted);
      expect(decrypted).toBe(testData);
    });

    it('should handle legacy plaintext data gracefully', () => {
      const service = new SecureStorageService();
      const plaintextBuffer = Buffer.from('sk-legacy-api-key', 'utf-8');

      // Simulate decryption failure for unencrypted data
      mockSafeStorage.decryptString.mockImplementation(() => {
        throw new Error('Ciphertext does not appear to be encrypted');
      });

      const decrypted = service.decryptString(plaintextBuffer);
      expect(decrypted).toBe('sk-legacy-api-key');
    });
  });

  describe('when encryption is not available', () => {
    beforeEach(() => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    });

    it('should store and retrieve as plaintext', () => {
      const service = new SecureStorageService();
      const testData = 'sk-test-api-key-12345';

      const encrypted = service.encryptString(testData);
      expect(encrypted.toString('utf-8')).toBe(testData);

      const decrypted = service.decryptString(encrypted);
      expect(decrypted).toBe(testData);
    });
  });
});

describe('IPC Handlers - Plaintext Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  });

  /**
   * This test covers the bug that caused:
   * "Cannot convert argument to a ByteString because the character at
   * index 9 has a value of 65533 which is greater than 255."
   *
   * When plaintext API keys (e.g., "sk-xxx...") were stored before encryption
   * was enabled, and later the system tried to decrypt them:
   * 1. The handler incorrectly tried to decode them as base64
   * 2. Buffer.from("sk-xxx...", 'base64') produces garbage bytes
   * 3. These garbage bytes include U+FFFD (65533) replacement characters
   * 4. Using these in HTTP headers causes the ByteString error
   */
  it('should handle legacy plaintext API keys without base64 decoding corruption', () => {
    registerSecureStorageHandlers();

    const decryptHandler = mockHandlers.get('secure-storage-decrypt');
    expect(decryptHandler).toBeDefined();

    // Simulate legacy plaintext data format (stored before encryption was available)
    // API keys contain hyphens which are NOT valid base64 characters
    const legacyPlaintextData = {
      openai: 'sk-proj-abc123-test-api-key',
      anthropic: 'sk-ant-api03-another-key-here',
    };

    const result = decryptHandler!({}, legacyPlaintextData);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(legacyPlaintextData);

    // Verify no replacement characters (U+FFFD) in the output
    for (const value of Object.values(result.data!)) {
      expect(value).not.toContain('\uFFFD');
    }
  });

  it('should properly decrypt base64-encoded encrypted data', () => {
    registerSecureStorageHandlers();

    const decryptHandler = mockHandlers.get('secure-storage-decrypt');
    expect(decryptHandler).toBeDefined();

    // Simulate properly encrypted data (base64-encoded buffer)
    const originalKey = 'sk-test-key-12345';
    const encryptedBuffer = Buffer.from('fake-encrypted-content');
    const base64Encrypted = encryptedBuffer.toString('base64');

    mockSafeStorage.decryptString.mockReturnValue(originalKey);

    const encryptedData = {
      openai: base64Encrypted,
    };

    const result = decryptHandler!({}, encryptedData);

    expect(result.success).toBe(true);
    expect(result.data?.openai).toBe(originalKey);
  });

  it('should fall back to plaintext when decryption fails', () => {
    registerSecureStorageHandlers();

    const decryptHandler = mockHandlers.get('secure-storage-decrypt');
    expect(decryptHandler).toBeDefined();

    // A string that looks like valid base64 but fails to decrypt
    const fakeBase64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo='; // "abcdefghijklmnopqrstuvwxyz"

    mockSafeStorage.decryptString.mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    const result = decryptHandler!({}, { testKey: fakeBase64 });

    expect(result.success).toBe(true);
    // Should fall back to treating as plaintext
    expect(result.data?.testKey).toBe(fakeBase64);
  });

  it('should fall back when decrypted value contains replacement characters', () => {
    registerSecureStorageHandlers();

    const decryptHandler = mockHandlers.get('secure-storage-decrypt');
    expect(decryptHandler).toBeDefined();

    // A string that looks like valid base64
    const validLookingBase64 = 'dGVzdGluZzEyMzQ1Njc4OTA=';

    // Simulate decryption returning garbage with replacement characters
    mockSafeStorage.decryptString.mockReturnValue('corrupt\uFFFDdata');

    const result = decryptHandler!({}, { testKey: validLookingBase64 });

    expect(result.success).toBe(true);
    // Should fall back to the original value since decrypted contained U+FFFD
    expect(result.data?.testKey).toBe(validLookingBase64);
  });
});

describe('IPC Handlers - Encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  });

  it('should encrypt data and return base64-encoded result', () => {
    registerSecureStorageHandlers();

    const encryptHandler = mockHandlers.get('secure-storage-encrypt');
    expect(encryptHandler).toBeDefined();

    const encryptedBuffer = Buffer.from('encrypted-content');
    mockSafeStorage.encryptString.mockReturnValue(encryptedBuffer);

    const result = encryptHandler!({}, { openai: 'sk-test-key' });

    expect(result.success).toBe(true);
    expect(result.data?.openai).toBe(encryptedBuffer.toString('base64'));
  });

  it('should handle encryption errors gracefully', () => {
    registerSecureStorageHandlers();

    const encryptHandler = mockHandlers.get('secure-storage-encrypt');
    expect(encryptHandler).toBeDefined();

    mockSafeStorage.encryptString.mockImplementation(() => {
      throw new Error('Encryption failed');
    });

    const result = encryptHandler!({}, { openai: 'sk-test-key' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to encrypt');
  });
});
