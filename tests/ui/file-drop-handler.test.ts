import { describe, it, expect } from 'vitest';
import { sanitizeFilePath, detectFileType } from '../../src/ui/utils/file-drop-handler';

describe('sanitizeFilePath', () => {
  it('should remove ../ path traversal sequences', () => {
    const maliciousPath = '/home/user/../../etc/passwd';
    const result = sanitizeFilePath(maliciousPath);
    expect(result).toBe('/home/user/etc/passwd');
    expect(result).not.toContain('..');
  });

  it('should remove ..\\ path traversal sequences (Windows)', () => {
    const maliciousPath = 'C:\\Users\\..\\..\\Windows\\System32';
    const result = sanitizeFilePath(maliciousPath);
    expect(result).toBe('C:\\Users\\Windows\\System32');
    expect(result).not.toContain('..');
  });

  it('should remove multiple consecutive path traversal sequences', () => {
    const maliciousPath = '/var/www/../../../etc/passwd';
    const result = sanitizeFilePath(maliciousPath);
    expect(result).toBe('/var/www/etc/passwd');
    expect(result).not.toContain('..');
  });

  it('should handle mixed forward and backward slashes', () => {
    const maliciousPath = '/home/user\\..\\../etc/passwd';
    const result = sanitizeFilePath(maliciousPath);
    expect(result).toBe('/home/user\\etc/passwd');
    expect(result).not.toContain('..');
  });

  it('should preserve legitimate paths without traversal', () => {
    const legitimatePath = '/home/user/documents/file.txt';
    const result = sanitizeFilePath(legitimatePath);
    expect(result).toBe(legitimatePath);
  });

  it('should handle empty string', () => {
    const result = sanitizeFilePath('');
    expect(result).toBe('');
  });

  it('should handle paths with dots in filenames', () => {
    const path = '/home/user/file.name.with.dots.txt';
    const result = sanitizeFilePath(path);
    expect(result).toBe(path);
  });

  it('should remove standalone .. sequences', () => {
    const path = '/home/user/..';
    const result = sanitizeFilePath(path);
    expect(result).toBe('/home/user/');
  });

  it('should handle complex attack patterns', () => {
    const maliciousPath = '../../../../../../etc/passwd';
    const result = sanitizeFilePath(maliciousPath);
    expect(result).toBe('etc/passwd');
    expect(result).not.toContain('..');
  });
});

describe('detectFileType', () => {
  it('should detect image files by MIME type', () => {
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    expect(detectFileType(file)).toBe('image');
  });

  it('should detect image files by extension', () => {
    const file = new File([''], 'test.png', { type: '' });
    expect(detectFileType(file)).toBe('image');
  });

  it('should detect PDF files by MIME type', () => {
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    expect(detectFileType(file)).toBe('pdf');
  });

  it('should detect PDF files by extension', () => {
    const file = new File([''], 'test.pdf', { type: '' });
    expect(detectFileType(file)).toBe('pdf');
  });

  it('should default to text for unknown types', () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    expect(detectFileType(file)).toBe('text');
  });
});
