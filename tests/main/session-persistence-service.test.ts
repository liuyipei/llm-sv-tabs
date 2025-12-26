import { describe, it, expect } from 'vitest';
import { SessionPersistenceMapper } from '../../src/main/tab-manager/session-persistence-mapper.js';
import type { TabData } from '../../src/types';

/**
 * SessionPersistenceService Unit Tests
 *
 * Tests for file path persistence functionality:
 * - File tabs with filePath should be persistable
 * - Binary content should be stripped when persisting file tabs
 *
 * Note: Tests for file restoration are skipped as they require mocking Node.js
 * built-in modules (fs) which is complex with vitest ESM.
 */

describe('SessionPersistenceService - Persistence Logic', () => {
  const mapper = new SessionPersistenceMapper();

  describe('isPersistable logic', () => {
    it('should include file tabs that have a filePath', () => {
      const fileTab: TabData = {
        id: 'tab-1',
        title: 'test.txt',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'test content',
          filePath: '/path/to/test.txt',
        },
      };

      expect(mapper.isPersistable(fileTab)).toBe(true);
    });

    it('should include upload tabs with filePath', () => {
      const uploadTab: TabData = {
        id: 'tab-1',
        title: 'image.png',
        url: 'upload://123',
        type: 'upload',
        metadata: {
          fileType: 'image',
          filePath: '/path/to/image.png',
        },
      };

      expect(mapper.isPersistable(uploadTab)).toBe(true);
    });

    it('should exclude upload tabs without filePath', () => {
      const uploadTab: TabData = {
        id: 'tab-1',
        title: 'upload',
        url: 'upload://123',
        type: 'upload',
        metadata: {},
      };

      expect(mapper.isPersistable(uploadTab)).toBe(false);
    });

    it('should exclude api-key-instructions tabs', () => {
      const instructionsTab: TabData = {
        id: 'tab-1',
        title: 'API Keys',
        url: 'api-keys://instructions',
        type: 'notes',
        component: 'api-key-instructions',
      };

      expect(mapper.isPersistable(instructionsTab)).toBe(false);
    });

    it('should exclude raw-message viewer tabs', () => {
      const rawMessageTab: TabData = {
        id: 'tab-1',
        title: 'Raw Message',
        url: 'raw-message://tab-5',
        type: 'notes',
      };

      expect(mapper.isPersistable(rawMessageTab)).toBe(false);
    });

    it('should include regular note tabs', () => {
      const noteTab: TabData = {
        id: 'tab-1',
        title: 'My Note',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'my note content',
        },
      };

      expect(mapper.isPersistable(noteTab)).toBe(true);
    });

    it('should include webpage tabs', () => {
      const webpageTab: TabData = {
        id: 'tab-1',
        title: 'Example',
        url: 'https://example.com',
        type: 'webpage',
      };

      expect(mapper.isPersistable(webpageTab)).toBe(true);
    });
  });

  describe('prepareTabForPersistence logic', () => {
    it('should strip imageData from image tabs with filePath', () => {
      const imageTab: TabData = {
        id: 'tab-1',
        title: 'image.png',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'image',
          imageData: 'data:image/png;base64,verylongbase64string...',
          filePath: '/path/to/image.png',
          mimeType: 'image/png',
        },
      };

      const result = mapper.prepareTabForPersistence(imageTab);

      expect(result.metadata?.filePath).toBe('/path/to/image.png');
      expect(result.metadata?.imageData).toBeUndefined();
      expect(result.metadata?.mimeType).toBe('image/png');
    });

    it('should keep noteContent for text files with filePath', () => {
      const textTab: TabData = {
        id: 'tab-1',
        title: 'file.txt',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'file contents here',
          filePath: '/path/to/file.txt',
        },
      };

      const result = mapper.prepareTabForPersistence(textTab);

      expect(result.metadata?.filePath).toBe('/path/to/file.txt');
      expect(result.metadata?.noteContent).toBe('file contents here');
    });

    it('should not modify tabs without filePath', () => {
      const noteTab: TabData = {
        id: 'tab-1',
        title: 'My Note',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'my note content',
        },
      };

      const result = mapper.prepareTabForPersistence(noteTab);

      expect(result).toEqual(noteTab);
    });

    it('should strip imageData from PDF tabs with filePath', () => {
      const pdfTab: TabData = {
        id: 'tab-1',
        title: 'document.pdf',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'pdf',
          imageData: 'data:application/pdf;base64,verylongbase64string...',
          filePath: '/path/to/document.pdf',
          mimeType: 'application/pdf',
        },
      };

      const result = mapper.prepareTabForPersistence(pdfTab);

      expect(result.metadata?.filePath).toBe('/path/to/document.pdf');
      expect(result.metadata?.imageData).toBeUndefined();
    });
  });

  describe('file tab detection logic', () => {
    it('should detect text file tabs', () => {
      const textTab: TabData = {
        id: 'tab-1',
        title: 'file.txt',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          filePath: '/path/to/file.txt',
        },
      };

      expect(mapper.isFileTab(textTab)).toBe(true);
    });

    it('should detect image file tabs', () => {
      const imageTab: TabData = {
        id: 'tab-1',
        title: 'image.png',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'image',
          filePath: '/path/to/image.png',
        },
      };

      expect(mapper.isFileTab(imageTab)).toBe(true);
    });

    it('should not detect regular note tabs as file tabs', () => {
      const noteTab: TabData = {
        id: 'tab-1',
        title: 'My Note',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'my note content',
        },
      };

      expect(mapper.isFileTab(noteTab)).toBe(false);
    });

    it('should not detect webpage tabs as file tabs', () => {
      const webpageTab: TabData = {
        id: 'tab-1',
        title: 'Example',
        url: 'https://example.com',
        type: 'webpage',
      };

      expect(mapper.isFileTab(webpageTab)).toBe(false);
    });

    it('should detect PDF tabs (which have component: undefined)', () => {
      // PDFs have component: undefined, unlike text files which have component: 'note'
      // This is critical - if this breaks, PDFs won't restore
      const pdfTab: TabData = {
        id: 'tab-1',
        title: 'document.pdf',
        url: 'note://123',
        type: 'notes',
        component: undefined,
        metadata: {
          fileType: 'pdf',
          filePath: '/path/to/document.pdf',
        },
      };

      expect(mapper.isFileTab(pdfTab)).toBe(true);
    });
  });

  describe('persistence round-trip integrity', () => {
    // These tests ensure that critical fields survive the persistence cycle
    // If these break, file tabs won't restore after browser restart

    it('should preserve filePath through persistence for PDF tabs', () => {
      const pdfTab: TabData = {
        id: 'tab-1',
        title: 'document.pdf',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'pdf',
          filePath: 'C:\\Users\\test\\document.pdf',
          mimeType: 'application/pdf',
        },
      };

      const prepared = mapper.prepareTabForPersistence(pdfTab);

      // Simulate JSON serialization (what happens when saving to session.json)
      const serialized = JSON.stringify(prepared);
      const restored: TabData = JSON.parse(serialized);

      // Critical: filePath must survive the round-trip
      expect(restored.metadata?.filePath).toBe('C:\\Users\\test\\document.pdf');
      expect(mapper.isFileTab(restored)).toBe(true);
    });

    it('should preserve fileType through persistence for image tabs', () => {
      const imageTab: TabData = {
        id: 'tab-1',
        title: 'photo.png',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'image',
          filePath: '/home/user/photo.png',
          imageData: 'data:image/png;base64,veryLongBase64...',
        },
      };

      const prepared = mapper.prepareTabForPersistence(imageTab);
      const serialized = JSON.stringify(prepared);
      const restored: TabData = JSON.parse(serialized);

      // Critical: fileType must survive (needed for restore logic)
      expect(restored.metadata?.fileType).toBe('image');
      expect(mapper.isFileTab(restored)).toBe(true);
    });

    it('should strip binary imageData but keep filePath and fileType', () => {
      const imageTab: TabData = {
        id: 'tab-1',
        title: 'large-image.png',
        url: 'note://123',
        type: 'notes',
        metadata: {
          fileType: 'image',
          filePath: '/path/to/large-image.png',
          imageData: 'data:image/png;base64,' + 'A'.repeat(10000), // Simulate large base64
          mimeType: 'image/png',
        },
      };

      const prepared = mapper.prepareTabForPersistence(imageTab);

      // Binary data should be stripped (saves storage space)
      expect(prepared.metadata?.imageData).toBeUndefined();

      // But restoration keys must remain
      expect(prepared.metadata?.filePath).toBe('/path/to/large-image.png');
      expect(prepared.metadata?.fileType).toBe('image');
    });

    it('should handle tabs with both filePath and fileType as undefined gracefully', () => {
      const noteTab: TabData = {
        id: 'tab-1',
        title: 'Manual Note',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'User typed this manually',
          // No filePath - this is a manual note, not an uploaded file
        },
      };

      const prepared = mapper.prepareTabForPersistence(noteTab);

      // Should not be detected as file tab
      expect(mapper.isFileTab(prepared)).toBe(false);

      // Content should be preserved for manual notes
      expect(prepared.metadata?.noteContent).toBe('User typed this manually');
    });
  });

  describe('restore condition precedence', () => {
    it('should route text file with filePath to file-tab handler, not note-tab', () => {
      const textFile: TabData = {
        id: 'tab-1',
        title: 'readme.txt',
        url: 'note://123',
        type: 'notes',
        component: 'note', // Text files have component: 'note'
        metadata: {
          fileType: 'text',
          filePath: '/path/to/readme.txt',
          noteContent: 'file contents',
        },
      };

      // Even though it has component: 'note', the filePath should take precedence
      expect(mapper.getRestoreHandler(textFile)).toBe('file-tab');
    });

    it('should route PDF to file-tab handler', () => {
      const pdfFile: TabData = {
        id: 'tab-1',
        title: 'document.pdf',
        url: 'note://123',
        type: 'notes',
        component: undefined, // PDFs don't have a component
        metadata: {
          fileType: 'pdf',
          filePath: '/path/to/document.pdf',
        },
      };

      expect(mapper.getRestoreHandler(pdfFile)).toBe('file-tab');
    });

    it('should route manual note (no filePath) to note-tab handler', () => {
      const manualNote: TabData = {
        id: 'tab-1',
        title: 'My Notes',
        url: 'note://123',
        type: 'notes',
        component: 'note',
        metadata: {
          fileType: 'text',
          noteContent: 'User typed content',
        },
      };

      expect(mapper.getRestoreHandler(manualNote)).toBe('note-tab');
    });

    it('should not route file tabs to unknown even if missing component', () => {
      // PDFs and images have component: undefined
      // They should still be handled, not fall through to unknown
      const imageFile: TabData = {
        id: 'tab-1',
        title: 'photo.jpg',
        url: 'note://123',
        type: 'notes',
        component: undefined,
        metadata: {
          fileType: 'image',
          filePath: '/path/to/photo.jpg',
        },
      };

      expect(mapper.getRestoreHandler(imageFile)).toBe('file-tab');
      expect(mapper.getRestoreHandler(imageFile)).not.toBe('unknown');
    });
  });
});
