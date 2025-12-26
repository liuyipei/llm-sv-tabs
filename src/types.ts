export interface ViewHandle {
  webContents: {
    isDestroyed(): boolean;
    loadURL(url: string): any;
    reload(): any;
    focus(): void;
    send?(channel: string, data?: any): void;
    removeAllListeners?(): void;
    on?(event: string, listener: (...args: any[]) => void): void;
  };
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  /**
   * Return the underlying platform view for adapters that need to attach to native containers.
   * Implementations should return undefined when running in headless tests.
   */
  getNativeView?(): unknown;
}

/**
 * Core type definitions for llm-sv-tabs
 */

// ============================================================================
// Tab Types
// ============================================================================

export type TabType = 'webpage' | 'pdf' | 'notes' | 'upload';

export interface Tab {
  id: string;
  title: string;
  url: string;
  type: TabType;
  favicon?: string;
  lastViewed?: number;
  created?: number;
  metadata?: TabMetadata;
  component?: 'llm-response' | 'note' | 'api-key-instructions' | 'aggregate-tabs';
  loadError?: {
    errorCode: number;
    errorDescription: string;
  };
}

export interface TabWithView extends Tab {
  view?: ViewHandle; // Optional for Svelte-rendered tabs
}

// Info about a context tab used in an LLM query (persisted for reference)
export interface ContextTabInfo {
  id: string; // Ephemeral session tab ID
  title: string;
  url: string;
  type: TabType;
  // For LLM response tabs, include their persistent identifiers
  persistentId?: string;
  shortId?: string;
  slug?: string;
}

export interface TabMetadata {
  // For LLM response tabs
  isLLMResponse?: boolean;
  query?: string;
  fullQuery?: string; // query with context from selected tabs
  response?: string;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  selectedTabIds?: string[];
  isStreaming?: boolean;
  error?: string;

  // Persistent identifiers for LLM tabs (survive restarts, more meaningful than tab-N)
  persistentId?: string; // UUID v4 - globally unique
  shortId?: string; // 8-char hash - derived from query+timestamp
  slug?: string; // Human-readable slug from query

  // Rich context tab info (stored at query time for persistence)
  contextTabs?: ContextTabInfo[];

  // For file/image tabs
  fileType?: 'text' | 'pdf' | 'image';
  mimeType?: string;
  imageData?: string; // base64 data URL for images
  noteContent?: string; // For editable text notes
  noteId?: number; // Identifier for note tabs/bookmarks
  filePath?: string; // Original file path for uploaded files (persisted for reload)
  fileLoadError?: string; // Error message when file could not be reloaded
  tempFilePath?: string; // Temp file path for large PDFs/images (not persisted)

  // Navigation state cache for renderer
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface TabData {
  id: string;
  title: string;
  url: string;
  type: TabType;
  component?: 'llm-response' | 'note' | 'api-key-instructions' | 'aggregate-tabs';
  metadata?: TabMetadata;
  created?: number;
  lastViewed?: number;
}

export type SortMode = 'time' | 'url' | 'title' | 'manual';
export type SortDirection = 'asc' | 'desc';

// ============================================================================
// Bookmark Types
// ============================================================================

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  created: number;
  tags?: string[];
  // For file-based bookmarks (PDFs, images, text files)
  filePath?: string;
  fileType?: 'text' | 'pdf' | 'image';
  // For text note bookmarks
  noteId?: number;
  noteContent?: string;
}

export type BookmarkResult = { bookmark: Bookmark; isNew: boolean };

// ============================================================================
// Chat/Message Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

// Support for multimodal content (text + images)
export type MessageContent = string | ContentBlock[];

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export type ContentBlock = TextContent | ImageContent;

export interface ChatMessage {
  id: number;
  role: MessageRole;
  content: MessageContent;
  timestamp?: number;
  stats?: MessageStats;
}

export interface MessageStats {
  tokensUsed?: number;
  responseTime?: number;
  model?: string;
}

// ============================================================================
// LLM Provider Types
// ============================================================================

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'xai'
  | 'openrouter'
  | 'fireworks'
  | 'ollama'
  | 'lmstudio'
  | 'vllm'
  | 'minimax'
  | 'local-openai-compatible';

export interface ProviderConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow?: number;
  supportsVision?: boolean;
}

export interface QueryOptions {
  provider: ProviderType;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  maxTokens?: number;
  systemPrompt?: string;
  includeMedia?: boolean;
  selectedTabIds?: string[];
  tabId?: string; // Existing tab ID to update instead of creating a new tab
}

export interface LLMResponse {
  response: string;
  tokensUsed?: number;
  tokensIn?: number;
  tokensOut?: number;
  responseTime?: number;
  model?: string;
  error?: string;
  fullQuery?: string; // The query with context from selected tabs
}

// ============================================================================
// Content Extraction Types
// ============================================================================

export type FileContentType = 'text' | 'pdf' | 'image';

export interface SerializedDOM {
  title: string;
  url: string;
  headings: string[];
  paragraphs: string[];
  links: Array<{ text: string; href: string }>;
  mainContent: string;
  metaTags: Record<string, string>;
}

export interface PDFContent {
  text: string;
  numPages: number;
  metadata?: Record<string, any>;
}

export interface ExtractedContent {
  type: 'html' | 'pdf' | 'text' | 'image';
  title: string;
  url: string;
  content: string | SerializedDOM | PDFContent;
  screenshot?: string; // base64 encoded image
  imageData?: {
    data: string; // base64 encoded image (data URL or just base64)
    mimeType: string; // e.g., 'image/png', 'image/jpeg'
  };
  metadata?: {
    extractionType?: 'article' | 'app'; // Smart extraction type
    tokenEstimate?: number; // Estimated tokens in content
    [key: string]: any; // Allow other metadata fields
  };
}

// PDF-specific extraction types (used by pdf-extractor.ts)
export interface PageText {
  pageNumber: number;
  text: string;
  extractionTimeMs?: number;
}

export interface PageImage {
  pageNumber: number;
  dataUrl: string; // PNG as data URL
  captureTimeMs?: number;
}

export interface PdfExtractedContent {
  textPages: PageText[];
  images: PageImage[];
  totalExtractionTimeMs?: number;
}

// ============================================================================
// IPC Message Types
// ============================================================================

export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TabCreatedEvent {
  tab: TabData;
}

export interface TabUpdatedEvent {
  tab: TabData;
}

export interface TabClosedEvent {
  id: string;
}

export interface TabTitleUpdatedEvent {
  id: string;
  title: string;
}

export interface TabUrlUpdatedEvent {
  id: string;
  url: string;
}

export interface NavigationStateUpdatedEvent {
  id: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface ActiveTabChangedEvent {
  id: string;
}

// Snapshot for cross-window/aggregate tab views
export interface TabRegistrySnapshot {
  windows: Array<{ id: string; activeTabId: string | null; tabIds: string[] }>;
  tabs: TabData[];
}

// ============================================================================
// Store State Types
// ============================================================================

export interface TabsState {
  activeTabs: Map<string, Tab>;
  selectedTabs: Set<string>;
  activeTabId: string | null;
  sortMode: SortMode;
  sortDirection: SortDirection;
}

export interface ConfigState {
  provider: ProviderType;
  model: string | null;
  apiKeys: Record<ProviderType, string>;
  maxTokens: number;
  systemPrompt: string;
}

export interface UIState {
  menuCollapsed: boolean;
  queryInput: string;
  urlInput: string;
  isLoading: boolean;
  messages: ChatMessage[];
}

// ============================================================================
// IPC Bridge Types
// ============================================================================

export interface IPCBridge {
  // Tab management
  openUrl(url: string): Promise<IPCResponse<TabData>>;
  closeTab(tabId: string): Promise<IPCResponse>;
  getActiveTabs(): Promise<IPCResponse<{ tabs: TabData[]; activeTabId: string | null }>>;
  getTabRegistrySnapshot(): Promise<IPCResponse<TabRegistrySnapshot>>;
  openAggregateTab(): Promise<IPCResponse<{ tabId: string; tab: TabData }>>;
  setActiveTab(tabId: string): Promise<IPCResponse>;
  selectTabs(tabIds: string[]): Promise<IPCResponse>;

  // Navigation
  goBack(tabId: string): Promise<IPCResponse>;
  goForward(tabId: string): Promise<IPCResponse>;
  getNavigationState(tabId: string): Promise<IPCResponse<{ canGoBack: boolean; canGoForward: boolean }>>;
  nextTab(): Promise<IPCResponse<{ tabId: string }>>;
  previousTab(): Promise<IPCResponse<{ tabId: string }>>;

  // Content extraction
  extractContent(tabId: string): Promise<IPCResponse<ExtractedContent>>;

  // LLM queries
  sendQuery(query: string, options?: QueryOptions): Promise<LLMResponse>;
  openLLMResponseTab(query: string, response?: string, error?: string): Promise<IPCResponse<{ tabId: string }>>;
  updateLLMResponseTab(tabId: string, response: string, metadata?: Partial<TabMetadata>): Promise<IPCResponse>;
  openRawMessageViewer(tabId: string): Promise<IPCResponse>;

  // Bookmarks
  getBookmarks(): Promise<IPCResponse<Bookmark[]>>;
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<BookmarkResult>>;
  deleteBookmark(id: string): Promise<IPCResponse>;

  // Screenshot capture
  triggerScreenshot(): Promise<IPCResponse<{ success: boolean }>>;

  // Event listeners
  onTabCreated(callback: (event: TabCreatedEvent) => void): void;
  onTabUpdated(callback: (event: TabUpdatedEvent) => void): void;
  onTabClosed(callback: (event: TabClosedEvent) => void): void;
  onTabTitleUpdated(callback: (event: TabTitleUpdatedEvent) => void): void;
  onTabUrlUpdated(callback: (event: TabUrlUpdatedEvent) => void): void;
  onActiveTabChanged(callback: (event: ActiveTabChangedEvent) => void): void;
  onNavigationStateUpdated(callback: (event: NavigationStateUpdatedEvent) => void): void;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncResult<T> = Promise<IPCResponse<T>>;

// ============================================================================
// Screenshot Types
// ============================================================================

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
