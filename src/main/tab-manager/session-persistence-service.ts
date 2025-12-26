import { basename } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { TabData, TabType, TabWithView, ViewHandle } from '../../types.js';
import { tempFileService } from '../services/temp-file-service.js';
import { getMimeType, createFileErrorHTML } from '../utils/file-utils.js';
import { SessionPersistenceMapper } from './session-persistence-mapper.js';

interface SessionPersistenceServiceDeps {
  tabs: Map<string, TabWithView>;
  createTabId: () => string;
  getTabData: (tabId: string) => TabData | null;
  sendToRenderer: (channel: string, payload: any, windowId?: string) => void;
  openUrl: (url: string, autoSelect: boolean, windowId?: string) => { tabId: string; tab: TabData };
  createView: (windowId?: string) => ViewHandle;
  setTabOwner: (tabId: string, windowId: string) => void;
  io?: SessionPersistenceIO;
}

export interface SessionPersistenceIO {
  exists(filePath: string): boolean;
  readText(filePath: string): string;
  readBinary(filePath: string): Buffer;
  createView(windowId?: string): ViewHandle;
  writeTempFile(tabId: string, content: string, fileType: 'pdf' | 'image'): string;
  loadURL(view: ViewHandle, url: string): void;
  createFileErrorHTML(title: string, error: string, path: string): string;
}

/**
 * Service for session persistence - filtering tabs for save and restoring different tab types.
 *
 * Persists: webpages, notes, LLM response tabs, file tabs (with filePath for reload)
 * Excludes: uploads without filePath (binary data only), api-key-instructions (ephemeral), raw-message viewer (reopenable)
 */
export class SessionPersistenceService {
  private readonly mapper: SessionPersistenceMapper;
  private readonly io: SessionPersistenceIO;

  constructor(private readonly deps: SessionPersistenceServiceDeps, mapper = new SessionPersistenceMapper()) {
    this.mapper = mapper;
    this.io = deps.io ?? {
      exists: (filePath) => existsSync(filePath),
      readText: (filePath) => readFileSync(filePath, 'utf-8'),
      readBinary: (filePath) => readFileSync(filePath),
      createView: (windowId?: string) => this.deps.createView(windowId),
      writeTempFile: (tabId, content, fileType) => tempFileService.writeToTempFile(tabId, content, fileType),
      loadURL: (view, url) => view.webContents.loadURL(url),
      createFileErrorHTML: (title, error, filePath) => createFileErrorHTML(title, error, filePath),
    };
  }

  /**
   * Filter tabs to get only those that should be persisted.
   * Excludes upload tabs without file paths, ephemeral helper tabs, and raw message viewers.
   */
  getTabsForPersistence(): TabData[] {
    const inMemoryTabs = new Map<string, TabData>();
    for (const tab of this.deps.tabs.values()) {
      const data = this.deps.getTabData(tab.id);
      if (data) inMemoryTabs.set(tab.id, data);
    }
    return this.mapper.getTabsForPersistence(inMemoryTabs);
  }

  /**
   * Restore a single tab based on its type and component.
   * Returns the new tab ID, or null if the tab type is unknown.
   */
  restoreTab(tabData: TabData, windowId?: string): string | null {
    // LLM Response tabs
    if (tabData.component === 'llm-response' && tabData.metadata?.isLLMResponse) {
      return this.restoreLLMResponseTab(tabData, windowId);
    }

    if (tabData.component === 'aggregate-tabs') {
      return this.restoreAggregateTab(tabData, windowId);
    }

    // File tabs with a file path (images, PDFs, text files from uploads)
    if (tabData.metadata?.filePath && tabData.metadata?.fileType) {
      return this.restoreFileTab(tabData, windowId);
    }

    // Text note tabs (manually created notes without file path)
    if (tabData.component === 'note' && tabData.type === 'notes') {
      return this.restoreNoteTab(tabData, windowId);
    }

    // Regular webpage tabs
    if (tabData.type === 'webpage') {
      return this.restoreWebpageTab(tabData, windowId);
    }

    // Unknown tab type - skip
    console.warn(`Skipping unknown tab type during restore: ${tabData.type}/${tabData.component}`);
    return null;
  }

  /**
   * Restore a webpage tab by reloading from URL.
   */
  private restoreWebpageTab(tabData: TabData, windowId?: string): string {
    const { tabId } = this.deps.openUrl(tabData.url, false, windowId);
    const tab = this.deps.tabs.get(tabId);
    if (tab && tabData.title !== 'Loading...') {
      tab.title = tabData.title;
    }
    return tabId;
  }

  /**
   * Restore an LLM response tab with its full metadata.
   */
  private restoreLLMResponseTab(tabData: TabData, windowId?: string): string {
    const tabId = this.deps.createTabId();
    const metadata = tabData.metadata || {};

    const tab: TabWithView = {
      id: tabId,
      title: tabData.title,
      url: tabData.url,
      type: 'notes' as TabType,
      component: 'llm-response',
      created: tabData.created || Date.now(),
      lastViewed: tabData.lastViewed || Date.now(),
      metadata: {
        isLLMResponse: true,
        query: metadata.query,
        fullQuery: metadata.fullQuery,
        response: metadata.response,
        error: metadata.error,
        tokensIn: metadata.tokensIn,
        tokensOut: metadata.tokensOut,
        model: metadata.model,
        selectedTabIds: metadata.selectedTabIds,
        contextTabs: metadata.contextTabs,
        isStreaming: false, // Never restore as streaming
        persistentId: metadata.persistentId,
        shortId: metadata.shortId,
        slug: metadata.slug,
      },
    };

    this.deps.tabs.set(tabId, tab);

    if (windowId) {
      this.deps.setTabOwner(tabId, windowId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);

    return tabId;
  }

  /**
   * Restore a text note tab with its content.
   */
  private restoreNoteTab(tabData: TabData, windowId?: string): string {
    const tabId = this.deps.createTabId();
    const metadata = tabData.metadata || {};

    const tab: TabWithView = {
      id: tabId,
      title: tabData.title,
      url: tabData.url,
      type: 'notes' as TabType,
      component: 'note',
      created: tabData.created || Date.now(),
      lastViewed: tabData.lastViewed || Date.now(),
      metadata: {
        fileType: 'text',
        noteContent: metadata.noteContent || '',
        noteId: metadata.noteId,
      },
    };

    this.deps.tabs.set(tabId, tab);

    if (windowId) {
      this.deps.setTabOwner(tabId, windowId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);

    return tabId;
  }

  /**
   * Restore an aggregate tabs view (component-backed, no WebContentsView).
   */
  private restoreAggregateTab(tabData: TabData, windowId?: string): string {
    const tabId = this.deps.createTabId();

    const tab: TabWithView = {
      id: tabId,
      title: tabData.title || 'All Windows',
      url: tabData.url || `aggregate-tabs://${windowId ?? 'primary'}`,
      type: 'notes' as TabType,
      component: 'aggregate-tabs',
      created: tabData.created || Date.now(),
      lastViewed: tabData.lastViewed || Date.now(),
    };

    this.deps.tabs.set(tabId, tab);

    if (windowId) {
      this.deps.setTabOwner(tabId, windowId);
    }

    this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);

    return tabId;
  }

  /**
   * Restore a file tab by reloading from the original file path.
   * If the file no longer exists, creates a tab with an error state.
   */
  private restoreFileTab(tabData: TabData, windowId?: string): string {
    const tabId = this.deps.createTabId();
    const metadata = tabData.metadata || {};
    const filePath = metadata.filePath!;
    const fileType = metadata.fileType as 'text' | 'pdf' | 'image';
    const title = tabData.title || basename(filePath);

    // Check if file exists
    if (!this.io.exists(filePath)) {
      // File no longer exists - create tab with error state
      console.warn(`File no longer exists: ${filePath}`);
      return this.createErrorFileTab(tabId, tabData, `File not found: ${filePath}`, windowId);
    }

    try {
      // Read the file based on type
      let content: string;
      let mimeType: string | undefined;

      if (fileType === 'text') {
        // Read text file
        content = this.io.readText(filePath);

        const tab: TabWithView = {
          id: tabId,
          title,
          url: content.trim().substring(0, 30) + (content.length > 30 ? '...' : '') || 'note://empty',
          type: 'notes' as TabType,
          component: 'note',
          created: tabData.created || Date.now(),
          lastViewed: tabData.lastViewed || Date.now(),
          metadata: {
            fileType: 'text',
            noteContent: content,
            filePath,
            noteId: metadata.noteId,
          },
        };

        this.deps.tabs.set(tabId, tab);

        if (windowId) {
          this.deps.setTabOwner(tabId, windowId);
        }

        this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);
        return tabId;
      } else {
        // Read binary file (image or PDF) as base64
        const buffer = this.io.readBinary(filePath);
        mimeType = getMimeType(filePath, fileType);
        content = `data:${mimeType};base64,${buffer.toString('base64')}`;

        const tab: TabWithView = {
          id: tabId,
          title,
          url: `note://${Date.now()}`,
          type: 'notes' as TabType,
          view: this.io.createView(windowId),
          created: tabData.created || Date.now(),
          lastViewed: tabData.lastViewed || Date.now(),
          metadata: {
            fileType,
            imageData: fileType === 'image' ? content : undefined,
            mimeType,
            filePath,
            noteId: metadata.noteId,
          },
        };

        this.deps.tabs.set(tabId, tab);

        if (windowId) {
          this.deps.setTabOwner(tabId, windowId);
        }

        // Write to temp file and load via file:// protocol
        // This avoids Chromium's ~2MB data URL limit that causes large files to fail
        if (tab.view) {
          const fileUrl = this.io.writeTempFile(tabId, content, fileType as 'pdf' | 'image');
          this.io.loadURL(tab.view, fileUrl);
        }

        this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);
        return tabId;
      }
    } catch (error) {
      // Error reading file - create tab with error state
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to read file ${filePath}:`, errorMessage);
      return this.createErrorFileTab(tabId, tabData, `Failed to read file: ${errorMessage}`, windowId);
    }
  }

  /**
   * Create a tab with an error state when file cannot be loaded.
   */
  private createErrorFileTab(tabId: string, tabData: TabData, errorMessage: string, windowId?: string): string {
    const metadata = tabData.metadata || {};
    const fileType = metadata.fileType as 'text' | 'pdf' | 'image';

    if (fileType === 'text') {
      // For text files, show error in the note content
      const tab: TabWithView = {
        id: tabId,
        title: tabData.title,
        url: 'File Error',
        type: 'notes' as TabType,
        component: 'note',
        created: tabData.created || Date.now(),
        lastViewed: tabData.lastViewed || Date.now(),
        metadata: {
          fileType: 'text',
          noteContent: '',
          filePath: metadata.filePath,
          fileLoadError: errorMessage,
        },
      };

      this.deps.tabs.set(tabId, tab);

      if (windowId) {
        this.deps.setTabOwner(tabId, windowId);
      }

      this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);
    } else {
      // For images/PDFs, create a view with error message
      const tab: TabWithView = {
        id: tabId,
        title: tabData.title,
        url: `note://error`,
        type: 'notes' as TabType,
        view: this.io.createView(windowId),
        created: tabData.created || Date.now(),
        lastViewed: tabData.lastViewed || Date.now(),
        metadata: {
          fileType,
          filePath: metadata.filePath,
          fileLoadError: errorMessage,
        },
      };

      this.deps.tabs.set(tabId, tab);

      if (windowId) {
        this.deps.setTabOwner(tabId, windowId);
      }

      // Load error HTML into WebContentsView
      if (tab.view) {
        const errorHtml = this.io.createFileErrorHTML(tabData.title, errorMessage, metadata.filePath!);
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml);
        this.io.loadURL(tab.view, dataUrl);
      }

      this.deps.sendToRenderer('tab-created', { tab: this.deps.getTabData(tabId) }, windowId);
    }

    return tabId;
  }
}
