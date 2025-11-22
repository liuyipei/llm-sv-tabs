import { BrowserView, BrowserWindow, Menu, MenuItem } from 'electron';
import type { Tab, TabData, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';

interface TabWithView extends Tab {
  view: BrowserView;
}

class TabManager {
  private mainWindow: BrowserWindow;
  private tabs: Map<string, TabWithView>;
  private activeTabId: string | null;
  private tabCounter: number;
  private sessionManager: SessionManager;
  private readonly SIDEBAR_WIDTH = 350;
  private readonly HEADER_HEIGHT = 53;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
    this.tabCounter = 0;
    this.sessionManager = new SessionManager();

    // Handle window resize to update BrowserView bounds
    this.mainWindow.on('resize', () => this.updateBrowserViewBounds());

    // Save session periodically (every 30 seconds)
    setInterval(() => this.saveSession(), 30000);

    // Save session before app quits
    this.mainWindow.on('close', () => {
      this.saveSession();
    });
  }

  private updateBrowserViewBounds(): void {
    if (!this.activeTabId) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab || !tab.view) return;

    const bounds = this.mainWindow.getContentBounds();
    tab.view.setBounds({
      x: this.SIDEBAR_WIDTH,
      y: this.HEADER_HEIGHT,
      width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
      height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
    });
  }

  private createTabId(): string {
    return `tab-${++this.tabCounter}`;
  }

  /**
   * Set up context menu for a BrowserView to handle right-clicks on links
   */
  private setupContextMenu(view: BrowserView, _tabId: string): void {
    view.webContents.on('context-menu', (_event, params) => {
      const { linkURL, x, y } = params;

      // Only show our custom menu if right-clicking on a link
      if (!linkURL) return;

      const menu = new Menu();

      // Open link in new tab
      menu.append(new MenuItem({
        label: 'Open link in new tab',
        click: () => {
          this.openUrl(linkURL);
        }
      }));

      // Save link as
      menu.append(new MenuItem({
        label: 'Save link as...',
        click: async () => {
          try {
            await view.webContents.downloadURL(linkURL);
          } catch (error) {
            console.error('Failed to download:', error);
          }
        }
      }));

      // Separator
      menu.append(new MenuItem({ type: 'separator' }));

      // Inspect element
      menu.append(new MenuItem({
        label: 'Inspect',
        click: () => {
          view.webContents.inspectElement(x, y);
          if (!view.webContents.isDevToolsOpened()) {
            view.webContents.openDevTools();
          }
        }
      }));

      menu.popup();
    });
  }

  openUrl(url: string): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tab: TabWithView = {
      id: tabId,
      title: 'Loading...',
      url: url,
      type: 'webpage' as TabType,
      view: view,
      created: Date.now(),
      lastViewed: Date.now(),
    };

    this.tabs.set(tabId, tab);

    // Load the URL
    view.webContents.loadURL(url);

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

    // Update title when page loads
    view.webContents.on('page-title-updated', (_event, title) => {
      tab.title = title;
      this.sendToRenderer('tab-title-updated', { id: tabId, title });
    });

    // Handle navigation
    view.webContents.on('did-navigate', (_event, url) => {
      tab.url = url;
      this.sendToRenderer('tab-url-updated', { id: tabId, url });
    });

    // Extract favicon when page finishes loading
    view.webContents.on('did-finish-load', async () => {
      const favicon = await this.extractFavicon(tabId);
      if (favicon) {
        tab.favicon = favicon;
        this.sendToRenderer('tab-favicon-updated', { id: tabId, favicon });
      }
    });

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openNoteTab(noteId: number, title: string, content: string, fileType: 'text' | 'pdf' | 'image' = 'text'): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tab: TabWithView = {
      id: tabId,
      title: title,
      url: `note://${noteId}`,
      type: 'notes' as TabType,
      view: view,
      created: Date.now(),
      lastViewed: Date.now(),
    };

    this.tabs.set(tabId, tab);

    // Create HTML content based on file type
    const htmlContent = this.createNoteHTML(title, content, fileType);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  openLLMResponseTab(query: string, response?: string, error?: string): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timestamp = Date.now();
    const isLoading = !response && !error;
    const tab: TabWithView = {
      id: tabId,
      title: error ? 'Error' : (isLoading ? 'Loading...' : 'LLM Response'),
      url: `llm-response://${timestamp}`,
      type: 'notes' as TabType,
      view: view,
      created: timestamp,
      lastViewed: timestamp,
      metadata: {
        isLLMResponse: true,
        query: query,
        response: response,
        error: error,
        isStreaming: isLoading,
      },
    };

    this.tabs.set(tabId, tab);

    // Create HTML content with markdown rendering
    const displayResponse = response || (isLoading ? 'Loading response...' : '');
    const htmlContent = this.createLLMResponseHTML(query, displayResponse, error);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu for links
    this.setupContextMenu(view, tabId);

    // Set as active tab
    this.setActiveTab(tabId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(tabId) });

    // Save session after tab change
    this.saveSession();

    return { tabId, tab: this.getTabData(tabId)! };
  }

  updateLLMResponseTab(tabId: string, response: string, metadata?: any): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Update tab metadata
    if (tab.metadata) {
      tab.metadata.response = response;
      tab.metadata.isStreaming = false;
      if (metadata) {
        Object.assign(tab.metadata, metadata);
      }
    }

    // Update tab title
    tab.title = metadata?.error ? 'Error' : 'LLM Response';

    // Re-create HTML content with updated response
    const query = tab.metadata?.query || '';
    const error = metadata?.error;
    const htmlContent = this.createLLMResponseHTML(query, response, error);

    // Reload HTML content
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    tab.view.webContents.loadURL(dataUrl);

    // Notify renderer of title update
    this.sendToRenderer('tab-title-updated', { id: tabId, title: tab.title });

    // Save session
    this.saveSession();

    return { success: true };
  }

  openRawMessageViewer(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };
    if (!tab.metadata?.isLLMResponse) return { success: false, error: 'Not an LLM response tab' };

    const rawViewId = this.createTabId();
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timestamp = Date.now();
    const rawTab: TabWithView = {
      id: rawViewId,
      title: 'Raw Message View',
      url: `raw-message://${timestamp}`,
      type: 'notes' as TabType,
      view: view,
      created: timestamp,
      lastViewed: timestamp,
    };

    this.tabs.set(rawViewId, rawTab);

    // Create HTML for raw message viewer
    const htmlContent = this.createRawMessageViewerHTML(tab.metadata);

    // Load HTML content using data URI
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    view.webContents.loadURL(dataUrl);

    // Set up context menu
    this.setupContextMenu(view, rawViewId);

    // Set as active tab
    this.setActiveTab(rawViewId);

    // Notify renderer
    this.sendToRenderer('tab-created', { tab: this.getTabData(rawViewId) });

    // Save session
    this.saveSession();

    return { success: true };
  }

  private createNoteHTML(title: string, content: string, fileType: 'text' | 'pdf' | 'image'): string {
    const baseStyles = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        margin: 0;
        padding: 40px 20px;
        background-color: #1e1e1e;
        color: #d4d4d4;
        line-height: 1.6;
      }
      h1 {
        color: #ffffff;
        border-bottom: 2px solid #007acc;
        padding-bottom: 10px;
        margin-bottom: 30px;
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
      }
    `;

    if (fileType === 'image') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    ${baseStyles}
    .image-container {
      text-align: center;
      max-width: 100%;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="image-container">
    <img src="${content}" alt="${this.escapeHtml(title)}" />
  </div>
</body>
</html>
      `.trim();
    }

    if (fileType === 'pdf') {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    ${baseStyles}
    .pdf-container {
      width: 100%;
      height: calc(100vh - 120px);
      display: flex;
      justify-content: center;
    }
    .pdf-container embed,
    .pdf-container object {
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="pdf-container">
    <embed src="${content}" type="application/pdf" />
  </div>
</body>
</html>
      `.trim();
    }

    // Default: text rendering
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    ${baseStyles}
    .note-content {
      max-width: 800px;
      margin: 0 auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 14px;
    }
    pre {
      background-color: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="note-content">${this.escapeHtml(content)}</div>
</body>
</html>
    `.trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private createLLMResponseHTML(query: string, response: string, error?: string): string {
    // Escape content for safe embedding in JavaScript
    const escapeForJs = (text: string): string => {
      return text
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
    };

    const content = error || response;
    const isError = !!error;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isError ? 'Error' : 'LLM Response'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      margin: 0;
      padding: 40px 20px;
      background-color: #1e1e1e;
      color: #d4d4d4;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    .query-section {
      background-color: #2d2d30;
      border-left: 4px solid #007acc;
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 4px;
    }

    .query-label {
      color: #007acc;
      font-weight: bold;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .query-text {
      color: #d4d4d4;
      font-size: 14px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .response-section {
      background-color: #252526;
      padding: 20px;
      border-radius: 4px;
    }

    .error-section {
      background-color: #5a1d1d;
      border-left: 4px solid #f48771;
      padding: 20px;
      border-radius: 4px;
    }

    .error-label {
      color: #f48771;
      font-weight: bold;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    /* Markdown styles */
    .markdown-content h1, .markdown-content h2, .markdown-content h3,
    .markdown-content h4, .markdown-content h5, .markdown-content h6 {
      color: #ffffff;
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }

    .markdown-content h1 {
      font-size: 2em;
      border-bottom: 1px solid #3e3e42;
      padding-bottom: 0.3em;
    }

    .markdown-content h2 {
      font-size: 1.5em;
      border-bottom: 1px solid #3e3e42;
      padding-bottom: 0.3em;
    }

    .markdown-content p {
      margin-top: 0;
      margin-bottom: 16px;
    }

    .markdown-content pre {
      background-color: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      margin-bottom: 16px;
    }

    .markdown-content code {
      background-color: #3c3c3c;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 85%;
    }

    .markdown-content pre code {
      background-color: transparent;
      padding: 0;
      border-radius: 0;
      font-size: 100%;
    }

    .markdown-content .inline-code {
      background-color: #3c3c3c;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 85%;
    }

    .markdown-content blockquote {
      border-left: 4px solid #3e3e42;
      padding-left: 16px;
      color: #8c8c8c;
      margin: 0 0 16px 0;
    }

    .markdown-content ul, .markdown-content ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }

    .markdown-content li {
      margin-bottom: 4px;
    }

    .markdown-content a {
      color: #3794ff;
      text-decoration: none;
    }

    .markdown-content a:hover {
      text-decoration: underline;
    }

    .markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }

    .markdown-content th, .markdown-content td {
      border: 1px solid #3e3e42;
      padding: 8px 12px;
      text-align: left;
    }

    .markdown-content th {
      background-color: #2d2d30;
      font-weight: 600;
    }

    .markdown-content img {
      max-width: 100%;
      height: auto;
    }

    /* KaTeX math */
    .markdown-content .katex {
      font-size: 1.1em;
    }

    .math-error {
      color: #f48771;
      background-color: #5a1d1d;
      padding: 2px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="query-section">
      <div class="query-label">Your Query</div>
      <div class="query-text">${this.escapeHtml(query)}</div>
    </div>

    ${isError ? '<div class="error-section"><div class="error-label">Error</div>' : '<div class="response-section">'}
      <div id="content" class="markdown-content"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/core.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/javascript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/python.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/java.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/cpp.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/typescript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/json.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/bash.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/sql.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>

  <script>
    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {}
        }
        return hljs.highlightAuto(code).value;
      }
    });

    // Process math in HTML
    function processMath(html) {
      // Process display math ($$...$$)
      html = html.replace(/\\$\\$([^$]+)\\$\\$/g, (_, math) => {
        try {
          return katex.renderToString(math.trim(), {
            displayMode: true,
            throwOnError: false
          });
        } catch (e) {
          return '<span class="math-error">$$' + math + '$$</span>';
        }
      });

      // Process inline math ($...$)
      html = html.replace(/\\$([^$]+)\\$/g, (_, math) => {
        try {
          return katex.renderToString(math.trim(), {
            displayMode: false,
            throwOnError: false
          });
        } catch (e) {
          return '<span class="math-error">$' + math + '$</span>';
        }
      });

      return html;
    }

    // Render markdown content
    const markdownText = \`${escapeForJs(content)}\`;
    const rawHtml = marked.parse(markdownText);
    const htmlWithMath = processMath(rawHtml);
    const sanitized = DOMPurify.sanitize(htmlWithMath);

    document.getElementById('content').innerHTML = sanitized;

    // Apply syntax highlighting to any code blocks that weren't highlighted by marked
    document.querySelectorAll('pre code:not(.hljs)').forEach((block) => {
      hljs.highlightElement(block);
    });
  </script>
</body>
</html>
    `.trim();
  }

  private createRawMessageViewerHTML(metadata: any): string {
    const abbreviate = (text: string, maxLength: number = 500): string => {
      if (!text) return '';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '... [truncated]';
    };

    const formatMetadata = (obj: any, indent: number = 0): string => {
      if (obj === null || obj === undefined) return 'null';

      const indentStr = '  '.repeat(indent);
      const nextIndent = '  '.repeat(indent + 1);

      if (typeof obj === 'string') {
        // Abbreviate long strings
        if (obj.length > 500) {
          return `"${this.escapeHtml(abbreviate(obj, 500))}"`;
        }
        return `"${this.escapeHtml(obj)}"`;
      }

      if (typeof obj === 'number' || typeof obj === 'boolean') {
        return String(obj);
      }

      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        const items = obj.map(item => `${nextIndent}${formatMetadata(item, indent + 1)}`).join(',\n');
        return `[\n${items}\n${indentStr}]`;
      }

      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => {
          const value = formatMetadata(obj[key], indent + 1);
          return `${nextIndent}"${this.escapeHtml(key)}": ${value}`;
        }).join(',\n');
        return `{\n${items}\n${indentStr}}`;
      }

      return String(obj);
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raw Message View</title>
  <style>
    body {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      margin: 0;
      padding: 40px 20px;
      background-color: #1e1e1e;
      color: #d4d4d4;
      line-height: 1.6;
      font-size: 13px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      color: #ffffff;
      border-bottom: 2px solid #007acc;
      padding-bottom: 10px;
      margin-bottom: 30px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .section {
      background-color: #252526;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 4px;
      border-left: 4px solid #007acc;
    }

    .section-title {
      color: #007acc;
      font-weight: bold;
      font-size: 14px;
      text-transform: uppercase;
      margin-bottom: 15px;
    }

    .field {
      margin-bottom: 15px;
    }

    .field-name {
      color: #9cdcfe;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .field-value {
      color: #ce9178;
      background-color: #2d2d30;
      padding: 10px;
      border-radius: 3px;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-x: auto;
    }

    .json-view {
      background-color: #1e1e1e;
      padding: 15px;
      border-radius: 3px;
      border: 1px solid #3e3e42;
      overflow-x: auto;
    }

    .truncated {
      color: #608b4e;
      font-style: italic;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .stat-box {
      background-color: #2d2d30;
      padding: 15px;
      border-radius: 4px;
      border-left: 3px solid #4ec9b0;
    }

    .stat-label {
      color: #4ec9b0;
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .stat-value {
      color: #ffffff;
      font-size: 18px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Raw Message View</h1>

    <div class="stats">
      ${metadata.tokensIn ? `
        <div class="stat-box">
          <div class="stat-label">Tokens In</div>
          <div class="stat-value">${metadata.tokensIn}</div>
        </div>
      ` : ''}
      ${metadata.tokensOut ? `
        <div class="stat-box">
          <div class="stat-label">Tokens Out</div>
          <div class="stat-value">${metadata.tokensOut}</div>
        </div>
      ` : ''}
      ${metadata.tokensIn && metadata.tokensOut ? `
        <div class="stat-box">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">${metadata.tokensIn + metadata.tokensOut}</div>
        </div>
      ` : ''}
      ${metadata.model ? `
        <div class="stat-box">
          <div class="stat-label">Model</div>
          <div class="stat-value" style="font-size: 14px;">${this.escapeHtml(metadata.model)}</div>
        </div>
      ` : ''}
    </div>

    <div class="section">
      <div class="section-title">Query</div>
      <div class="field">
        <div class="field-value">${this.escapeHtml(metadata.query || '')}</div>
      </div>
    </div>

    ${metadata.fullQuery && metadata.fullQuery !== metadata.query ? `
      <div class="section">
        <div class="section-title">Full Query (with context)</div>
        <div class="field">
          <div class="field-value">${this.escapeHtml(abbreviate(metadata.fullQuery, 2000))}</div>
        </div>
      </div>
    ` : ''}

    ${metadata.selectedTabIds && metadata.selectedTabIds.length > 0 ? `
      <div class="section">
        <div class="section-title">Selected Tabs</div>
        <div class="field">
          <div class="field-value">${metadata.selectedTabIds.map((id: string) => this.escapeHtml(id)).join(', ')}</div>
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Response</div>
      <div class="field">
        <div class="field-value">${this.escapeHtml(abbreviate(metadata.response || '', 2000))}</div>
      </div>
    </div>

    ${metadata.error ? `
      <div class="section" style="border-left-color: #f48771;">
        <div class="section-title" style="color: #f48771;">Error</div>
        <div class="field">
          <div class="field-value">${this.escapeHtml(metadata.error)}</div>
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Full Metadata (JSON)</div>
      <div class="json-view">${formatMetadata(metadata)}</div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  closeTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Destroy the view
    if (tab.view) {
      this.mainWindow.removeBrowserView(tab.view);
      // Note: WebContents cleanup is handled automatically when BrowserView is removed
      // The destroy() method was removed in newer Electron versions
    }

    // Remove from tabs
    this.tabs.delete(tabId);

    // If this was the active tab, switch to another
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      this.activeTabId = remainingTabs.length > 0 ? remainingTabs[0] : null;
      if (this.activeTabId) {
        this.setActiveTab(this.activeTabId);
      }
    }

    // Notify renderer
    this.sendToRenderer('tab-closed', { id: tabId });

    // Save session after tab change
    this.saveSession();

    return { success: true };
  }

  setActiveTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // Hide current active tab
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.tabs.get(this.activeTabId);
      if (currentTab && currentTab.view) {
        this.mainWindow.removeBrowserView(currentTab.view);
      }
    }

    // Show new active tab
    this.activeTabId = tabId;
    tab.lastViewed = Date.now();

    if (tab.view) {
      this.mainWindow.addBrowserView(tab.view);

      // Position the view to the right of the sidebar and below the header
      const bounds = this.mainWindow.getContentBounds();
      tab.view.setBounds({
        x: this.SIDEBAR_WIDTH,
        y: this.HEADER_HEIGHT,
        width: Math.max(0, bounds.width - this.SIDEBAR_WIDTH),
        height: Math.max(0, bounds.height - this.HEADER_HEIGHT),
      });
    }

    // Notify renderer
    this.sendToRenderer('active-tab-changed', { id: tabId });

    return { success: true };
  }

  getActiveTabs(): { tabs: TabData[]; activeTabId: string | null } {
    const tabs = Array.from(this.tabs.values()).map((tab) => this.getTabData(tab.id)!);
    return {
      tabs,
      activeTabId: this.activeTabId,
    };
  }

  getTabData(tabId: string): TabData | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      type: tab.type,
    };
  }

  /**
   * Extract favicon from page
   */
  private async extractFavicon(tabId: string): Promise<string | null> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return null;

    try {
      const result = await tab.view.webContents.executeJavaScript(`
        (function() {
          // Check for icon link tags
          const iconLink = document.querySelector('link[rel~="icon"]');
          if (iconLink) {
            return iconLink.getAttribute('href');
          }

          const shortcutIcon = document.querySelector('link[rel="shortcut icon"]');
          if (shortcutIcon) {
            return shortcutIcon.getAttribute('href');
          }

          // Default favicon location
          return '/favicon.ico';
        })();
      `);

      // Convert relative URLs to absolute
      if (result && !result.startsWith('http')) {
        const url = new URL(tab.url);
        return new URL(result, url.origin).href;
      }

      return result;
    } catch (error) {
      console.error('Failed to extract favicon:', error);
      return null;
    }
  }

  selectTabs(tabIds: string[]): { success: boolean; selectedTabs: string[] } {
    // This is for bulk operations - store selected tabs
    return { success: true, selectedTabs: tabIds };
  }

  reloadTab(tabId: string): { success: boolean; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    if (tab.view && tab.view.webContents) {
      tab.view.webContents.reload();
      return { success: true };
    }

    return { success: false, error: 'Tab view not available' };
  }

  copyTabUrl(tabId: string): { success: boolean; url?: string; error?: string } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    return { success: true, url: tab.url };
  }

  getTabView(tabId: string): BrowserView | null {
    const tab = this.tabs.get(tabId);
    return tab?.view ?? null;
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Save current session to disk
   */
  private saveSession(): void {
    const tabs = Array.from(this.tabs.values())
      .map((tab) => this.getTabData(tab.id)!)
      .filter((tab) => tab.type !== 'notes' && tab.type !== 'upload'); // Don't persist note tabs
    this.sessionManager.saveSession(tabs, this.activeTabId);
  }

  /**
   * Restore session from disk
   */
  restoreSession(): boolean {
    const session = this.sessionManager.loadSession();
    if (!session || session.tabs.length === 0) {
      return false;
    }

    // Restore each tab
    for (const tabData of session.tabs) {
      const { tabId } = this.openUrl(tabData.url);
      const tab = this.tabs.get(tabId);
      if (tab && tabData.title !== 'Loading...') {
        tab.title = tabData.title;
      }
    }

    // Restore active tab
    if (session.activeTabId && this.tabs.has(session.activeTabId)) {
      this.setActiveTab(session.activeTabId);
    }

    return true;
  }

  /**
   * Clear saved session
   */
  clearSession(): void {
    this.sessionManager.clearSession();
  }
}

export default TabManager;
