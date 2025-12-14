import { WebContentsView } from 'electron';
import { readFileSync, existsSync } from 'fs';
import { extname, normalize as normalizePath } from 'path';
import type { TabData, TabMetadata, TabType, TabWithView } from '../../types';
import { tempFileService } from '../services/temp-file-service.js';

interface NoteTabServiceDeps {
  tabs: Map<string, TabWithView>;
  createTabId: () => string;
  getTabData: (tabId: string) => TabData | null;
  sendToRenderer: (channel: string, payload: any) => void;
  saveSession: () => Promise<void> | void;
  setActiveTab: (tabId: string) => void;
  createView: () => WebContentsView;
}

type NoteTabType = 'text' | 'pdf' | 'image';

export class NoteTabService {
  constructor(private readonly deps: NoteTabServiceDeps) {}

  openNoteTab(
    noteId: number,
    title: string,
    content: string,
    fileType: NoteTabType = 'text',
    autoSelect: boolean = true,
    filePath?: string
  ): { tabId: string; tab: TabData } {
    const existingTab = this.findExistingNoteTab({ noteId, filePath });
    if (existingTab) {
      this.deps.setActiveTab(existingTab.id);
      return { tabId: existingTab.id, tab: this.deps.getTabData(existingTab.id)! };
    }

    const tabId = this.deps.createTabId();

    // For text notes, use Svelte component (editable); for images/PDFs, use WebContentsView
    const useWebContentsView = fileType !== 'text';

    // Generate URL: for text notes, show preview of content; otherwise use note:// protocol
    const noteUrl = fileType === 'text' ? this.generateNoteUrl(content) : `note://${noteId}`;

    const tab: TabWithView = {
      id: tabId,
      title: title,
      url: noteUrl,
      type: 'notes' as TabType,
      view: useWebContentsView ? this.deps.createView() : undefined,
      component: fileType === 'text' ? 'note' : undefined,
      created: Date.now(),
      lastViewed: Date.now(),
      metadata: this.buildMetadata({ fileType, content, filePath, noteId }),
    };

    this.deps.tabs.set(tabId, tab);

    if (useWebContentsView && tab.view) {
      const fileUrl = tempFileService.writeToTempFile(tabId, content, fileType as 'pdf' | 'image');
      tab.view.webContents.loadURL(fileUrl);
    }

    if (autoSelect) {
      this.deps.setActiveTab(tabId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) });
    void this.deps.saveSession();

    return { tabId, tab: this.deps.getTabData(tabId)! };
  }

  openFileFromBookmark(
    title: string,
    filePath: string,
    fileType: NoteTabType,
    noteId?: number
  ): { success: boolean; data?: { tabId: string; tab: TabData }; error?: string } {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const existingTab = this.findExistingNoteTab({ filePath });
    if (existingTab) {
      this.deps.setActiveTab(existingTab.id);
      return { success: true, data: { tabId: existingTab.id, tab: this.deps.getTabData(existingTab.id)! } };
    }

    try {
      const tabId = this.deps.createTabId();

      if (fileType === 'text') {
        const content = readFileSync(filePath, 'utf-8');
        const tab = this.createTextNoteTab({ tabId, title, content, filePath, noteId });

        this.deps.tabs.set(tabId, tab);
        this.deps.setActiveTab(tabId);
        this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) });
        void this.deps.saveSession();

        return { success: true, data: { tabId, tab: this.deps.getTabData(tabId)! } };
      }

      const buffer = readFileSync(filePath);
      const mimeType = this.getMimeTypeForFile(filePath, fileType);
      const content = `data:${mimeType};base64,${buffer.toString('base64')}`;

      const tab: TabWithView = {
        id: tabId,
        title,
        url: `note://${Date.now()}`,
        type: 'notes' as TabType,
        view: this.deps.createView(),
        created: Date.now(),
        lastViewed: Date.now(),
        metadata: {
          fileType,
          imageData: fileType === 'image' ? content : undefined,
          mimeType,
          filePath,
          noteId,
        },
      };

      this.deps.tabs.set(tabId, tab);

      if (tab.view) {
        const fileUrl = tempFileService.writeToTempFile(tabId, content, fileType as 'pdf' | 'image');
        tab.view.webContents.loadURL(fileUrl);
      }

      this.deps.setActiveTab(tabId);
      this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) });
      void this.deps.saveSession();

      return { success: true, data: { tabId, tab: this.deps.getTabData(tabId)! } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to open file from bookmark ${filePath}:`, errorMessage);
      return { success: false, error: `Failed to read file: ${errorMessage}` };
    }
  }

  updateNoteContent(tabId: string, content: string): { success: boolean; error?: string } {
    const tab = this.deps.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (tab.metadata?.fileType !== 'text') return { success: false, error: 'Not a text note tab' };

    if (tab.metadata) {
      tab.metadata.noteContent = content;
    }

    tab.url = this.generateNoteUrl(content);
    this.deps.sendToRenderer('tab-url-updated', { id: tabId, url: tab.url });

    return { success: true };
  }

  private buildMetadata({
    fileType,
    content,
    filePath,
    noteId,
  }: {
    fileType: NoteTabType;
    content: string;
    filePath?: string;
    noteId?: number;
  }): TabMetadata {
    return {
      fileType,
      noteContent: fileType === 'text' ? content : undefined,
      noteId,
      imageData: fileType === 'image' ? content : undefined,
      mimeType:
        fileType === 'image' && content.startsWith('data:') ? content.split(';')[0].split(':')[1] : undefined,
      filePath,
    };
  }

  private createTextNoteTab({
    tabId,
    title,
    content,
    filePath,
    noteId,
  }: {
    tabId: string;
    title: string;
    content: string;
    filePath: string;
    noteId?: number;
  }): TabWithView {
    return {
      id: tabId,
      title,
      url: this.generateNoteUrl(content),
      type: 'notes' as TabType,
      component: 'note',
      created: Date.now(),
      lastViewed: Date.now(),
      metadata: {
        fileType: 'text',
        noteContent: content,
        filePath,
        noteId,
      },
    };
  }

  private findExistingNoteTab(match: { noteId?: number; filePath?: string }): TabWithView | undefined {
    const normalizedIncomingPath = match.filePath ? this.normalizeFilePath(match.filePath) : undefined;

    return Array.from(this.deps.tabs.values()).find((tab) => {
      if (tab.type !== 'notes') return false;
      const metadata = tab.metadata;

      if (metadata?.noteId !== undefined && match.noteId !== undefined && metadata.noteId === match.noteId) {
        return true;
      }

      if (normalizedIncomingPath && metadata?.filePath) {
        const normalizedExistingPath = this.normalizeFilePath(metadata.filePath);
        if (normalizedExistingPath === normalizedIncomingPath) {
          return true;
        }
      }

      return false;
    });
  }

  private normalizeFilePath(filePath: string): string {
    const normalized = normalizePath(filePath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }

  private getMimeTypeForFile(filePath: string, fileType: 'image' | 'pdf'): string {
    const ext = extname(filePath).toLowerCase();

    if (fileType === 'pdf') {
      return 'application/pdf';
    }

    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  private generateNoteUrl(content: string): string {
    if (!content || content.trim().length === 0) {
      return 'note://empty';
    }

    const preview = content.trim().substring(0, 30).replace(/\s+/g, ' ');
    return preview + (content.length > 30 ? '...' : '');
  }
}
