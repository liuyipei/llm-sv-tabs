/**
 * HTML template generator for LLM response tabs
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createLLMResponseHTML(query: string, response: string, error?: string, metadata?: any): string {
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

    .metadata-section {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }

    .metadata-box {
      background-color: #2d2d30;
      padding: 15px 20px;
      border-radius: 4px;
      border-left: 3px solid #4ec9b0;
      min-width: 150px;
    }

    .metadata-label {
      color: #4ec9b0;
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 5px;
      font-weight: bold;
    }

    .metadata-value {
      color: #ffffff;
      font-size: 16px;
      font-weight: bold;
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
      <div class="query-text">${escapeHtml(query)}</div>
    </div>

    ${metadata && (metadata.model || metadata.tokensIn || metadata.tokensOut) ? `
    <div class="metadata-section">
      ${metadata.model ? `
        <div class="metadata-box">
          <div class="metadata-label">Model</div>
          <div class="metadata-value">${escapeHtml(metadata.model)}</div>
        </div>
      ` : ''}
      ${metadata.tokensIn ? `
        <div class="metadata-box">
          <div class="metadata-label">Tokens In</div>
          <div class="metadata-value">${metadata.tokensIn.toLocaleString()}</div>
        </div>
      ` : ''}
      ${metadata.tokensOut ? `
        <div class="metadata-box">
          <div class="metadata-label">Tokens Out</div>
          <div class="metadata-value">${metadata.tokensOut.toLocaleString()}</div>
        </div>
      ` : ''}
      ${metadata.tokensIn && metadata.tokensOut ? `
        <div class="metadata-box">
          <div class="metadata-label">Total Tokens</div>
          <div class="metadata-value">${(metadata.tokensIn + metadata.tokensOut).toLocaleString()}</div>
        </div>
      ` : ''}
    </div>
    ` : ''}

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
