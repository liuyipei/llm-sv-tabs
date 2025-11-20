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
}

export interface TabData {
  id: string;
  title: string;
  url: string;
  type: TabType;
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
}

// ============================================================================
// Chat/Message Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: number;
  role: MessageRole;
  content: string;
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
  temperature?: number;
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
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  includeMedia?: boolean;
  selectedTabIds?: string[];
}

export interface LLMResponse {
  response: string;
  tokensUsed?: number;
  responseTime?: number;
  model?: string;
  error?: string;
}

// ============================================================================
// Content Extraction Types
// ============================================================================

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
  type: 'html' | 'pdf' | 'text';
  title: string;
  url: string;
  content: string | SerializedDOM | PDFContent;
  screenshot?: string; // base64 encoded image
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

export interface ActiveTabChangedEvent {
  id: string;
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
  temperature: number;
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
  setActiveTab(tabId: string): Promise<IPCResponse>;
  selectTabs(tabIds: string[]): Promise<IPCResponse>;

  // Content extraction
  extractContent(tabId: string): Promise<IPCResponse<ExtractedContent>>;

  // LLM queries
  sendQuery(query: string, options?: QueryOptions): Promise<LLMResponse>;

  // Bookmarks
  getBookmarks(): Promise<IPCResponse<Bookmark[]>>;
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'created'>): Promise<IPCResponse<Bookmark>>;
  deleteBookmark(id: string): Promise<IPCResponse>;

  // Event listeners
  onTabCreated(callback: (event: TabCreatedEvent) => void): void;
  onTabClosed(callback: (event: TabClosedEvent) => void): void;
  onTabTitleUpdated(callback: (event: TabTitleUpdatedEvent) => void): void;
  onTabUrlUpdated(callback: (event: TabUrlUpdatedEvent) => void): void;
  onActiveTabChanged(callback: (event: ActiveTabChangedEvent) => void): void;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncResult<T> = Promise<IPCResponse<T>>;
