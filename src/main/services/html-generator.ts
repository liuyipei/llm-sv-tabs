/**
 * HTML generation utilities for tab content
 */

export class HTMLGenerator {
  /**
   * Escape HTML special characters
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Create HTML for note content
   */
  static createNoteHTML(title: string, content: string, fileType: 'text' | 'pdf' | 'image'): string {
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

  /**
   * Create HTML for LLM response with markdown rendering
   */
  static createLLMResponseHTML(query: string, response: string, error?: string): string {
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

  /**
   * Create HTML for raw message viewer showing metadata
   */
  static createRawMessageViewerHTML(metadata: any): string {
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
}
