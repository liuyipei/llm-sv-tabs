import { BrowserView, BrowserWindow, Menu, MenuItem } from 'electron';
import type { Tab, TabData, TabType } from '../types';
import { SessionManager } from './services/session-manager.js';

interface TabWithView extends Tab {
  view: BrowserView;
  thumbnail?: string;
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

    // Capture thumbnail and favicon when page finishes loading
    view.webContents.on('did-finish-load', async () => {
      await this.captureThumbnail(tabId);
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

  openLLMResponseTab(query: string, response: string, error?: string): { tabId: string; tab: TabData } {
    const tabId = this.createTabId();

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timestamp = Date.now();
    const tab: TabWithView = {
      id: tabId,
      title: error ? 'Error' : 'LLM Response',
      url: `llm-response://${timestamp}`,
      type: 'notes' as TabType,
      view: view,
      created: timestamp,
      lastViewed: timestamp,
    };

    this.tabs.set(tabId, tab);

    // Create HTML content with markdown rendering
    const htmlContent = this.createLLMResponseHTML(query, response, error);

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
      thumbnail: tab.thumbnail,
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

  /**
   * Extract OG image or twitter image from page metadata
   * Following Chrome's approach: check OG images first
   */
  private async extractMetaImage(tabId: string): Promise<string | null> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return null;

    try {
      const result = await tab.view.webContents.executeJavaScript(`
        (function() {
          // Check for Open Graph image
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage) {
            return ogImage.getAttribute('content');
          }

          // Check for Twitter image
          const twitterImage = document.querySelector('meta[name="twitter:image"]');
          if (twitterImage) {
            return twitterImage.getAttribute('content');
          }

          // Check for Twitter card image
          const twitterCard = document.querySelector('meta[property="twitter:image"]');
          if (twitterCard) {
            return twitterCard.getAttribute('content');
          }

          return null;
        })();
      `);

      return result;
    } catch (error) {
      console.error('Failed to extract meta image:', error);
      return null;
    }
  }

  /**
   * Capture thumbnail for a tab
   * Following Chrome's approach:
   * 1. Check for OG image or Twitter image (preferred)
   * 2. Fall back to screenshot if no metadata image
   */
  private async captureThumbnail(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.view || !tab.view.webContents) return;

    try {
      // First, try to get OG image or Twitter image
      const metaImageUrl = await this.extractMetaImage(tabId);

      if (metaImageUrl) {
        // Use the meta image as thumbnail
        tab.thumbnail = metaImageUrl;
        this.sendToRenderer('tab-thumbnail-updated', { id: tabId, thumbnail: metaImageUrl });
        return;
      }

      // Fall back to screenshot if no meta image
      const image = await tab.view.webContents.capturePage({
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      });

      // Resize to thumbnail size
      const thumbnail = image.resize({ width: 160, height: 90 });
      const dataUrl = thumbnail.toDataURL();

      // Store thumbnail
      tab.thumbnail = dataUrl;

      // Notify renderer
      this.sendToRenderer('tab-thumbnail-updated', { id: tabId, thumbnail: dataUrl });
    } catch (error) {
      console.error('Failed to capture thumbnail:', error);
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
