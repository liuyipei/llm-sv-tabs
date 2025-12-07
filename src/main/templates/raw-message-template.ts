/**
 * HTML template generator for raw message viewer tabs
 * Matches the main MessageStream.svelte layout
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createRawMessageViewerHTML(metadata: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raw Message View</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 1rem;
      background-color: #252526;
      color: #d4d4d4;
      line-height: 1.6;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
    }

    /* Section base styles */
    .section {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background-color: #1e1e1e;
      border-radius: 4px;
    }

    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.5rem;
    }

    /* Query section - blue theme */
    .query-section {
      border-left: 3px solid #007acc;
    }
    .query-section .section-label {
      color: #007acc;
    }
    .query-header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .query-timestamp {
      font-size: 0.75rem;
      color: #8c8c8c;
      font-style: italic;
    }
    .query-text {
      font-size: 0.95rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Tab identifiers section - also blue theme */
    .identifiers-section {
      border-left: 3px solid #569cd6;
    }
    .identifiers-section .section-label {
      color: #569cd6;
    }
    .identifier-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.85rem;
    }
    .identifier-label {
      color: #9cdcfe;
      min-width: 100px;
    }
    .identifier-value {
      color: #ce9178;
      word-break: break-all;
    }

    /* Context section - pink/purple theme */
    .context-section {
      border-left: 3px solid #c586c0;
    }
    .context-section .section-label {
      color: #c586c0;
    }
    .context-tabs {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .context-tab-item {
      padding: 0.5rem;
      background-color: #252526;
      border-radius: 3px;
      border: 1px solid #3e3e42;
    }
    .context-tab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
    }
    .context-tab-title {
      font-size: 0.9rem;
      font-weight: 500;
      color: #d4d4d4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-tab-type {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.15rem 0.4rem;
      background-color: #3e3e42;
      color: #9cdcfe;
      border-radius: 3px;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .context-tab-url {
      font-size: 0.75rem;
      color: #8c8c8c;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    }
    .context-tab-ids {
      margin-top: 0.25rem;
      font-size: 0.7rem;
      color: #4ec9b0;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    }
    .context-id {
      margin-right: 1rem;
    }

    /* Response section - teal theme */
    .response-section {
      border-left: 3px solid #4ec9b0;
    }
    .response-section .section-label {
      color: #4ec9b0;
    }
    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.9rem;
      margin-top: 0.5rem;
      margin-bottom: 1rem;
    }
    .metadata-item {
      color: #d4d4d4;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .metadata-label {
      color: #9cdcfe;
      font-weight: 500;
    }
    .metadata-value {
      color: #dcdcaa;
      font-weight: 600;
    }
    .response-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    /* Error section - red theme */
    .error-section {
      border-left: 3px solid #f48771;
      background-color: #5a1d1d;
    }
    .error-section .section-label {
      color: #f48771;
    }
    .error-content {
      color: #f48771;
    }

    /* Full query section - orange theme */
    .fullquery-section {
      border-left: 3px solid #ce9178;
    }
    .fullquery-section .section-label {
      color: #ce9178;
    }
    .fullquery-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 0.85rem;
      max-height: 300px;
      overflow-y: auto;
      background-color: #252526;
      padding: 0.75rem;
      border-radius: 3px;
    }

    /* JSON section */
    .json-section {
      border-left: 3px solid #808080;
    }
    .json-section .section-label {
      color: #808080;
    }
    .json-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .copy-btn {
      background-color: #007acc;
      color: white;
      border: none;
      padding: 0.4rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .copy-btn:hover {
      background-color: #005a9e;
    }
    .json-content {
      background-color: #252526;
      padding: 0.75rem;
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Query Section -->
    <div class="section query-section">
      <div class="query-header-top">
        <div class="section-label">Query</div>
      </div>
      <div class="query-text">${escapeHtml(metadata.query || '')}</div>
    </div>

    <!-- Tab Identifiers Section -->
    ${metadata.persistentId || metadata.shortId || metadata.slug ? `
    <div class="section identifiers-section">
      <div class="section-label">Tab Identifiers</div>
      ${metadata.slug ? `<div class="identifier-row"><span class="identifier-label">Slug:</span><span class="identifier-value">${escapeHtml(metadata.slug)}</span></div>` : ''}
      ${metadata.shortId ? `<div class="identifier-row"><span class="identifier-label">Short ID:</span><span class="identifier-value">${escapeHtml(metadata.shortId)}</span></div>` : ''}
      ${metadata.persistentId ? `<div class="identifier-row"><span class="identifier-label">UUID:</span><span class="identifier-value">${escapeHtml(metadata.persistentId)}</span></div>` : ''}
    </div>
    ` : ''}

    <!-- Context Section -->
    ${metadata.contextTabs && metadata.contextTabs.length > 0 ? `
    <div class="section context-section">
      <div class="section-label">Context (${metadata.contextTabs.length} tab${metadata.contextTabs.length === 1 ? '' : 's'})</div>
      <div class="context-tabs">
        ${metadata.contextTabs.map((tab: any) => `
          <div class="context-tab-item">
            <div class="context-tab-header">
              <span class="context-tab-title">${escapeHtml(tab.title)}</span>
              <span class="context-tab-type">${escapeHtml(tab.type)}</span>
            </div>
            ${tab.url ? `<div class="context-tab-url">${escapeHtml(tab.url)}</div>` : ''}
            ${tab.slug || tab.shortId ? `
              <div class="context-tab-ids">
                ${tab.slug ? `<span class="context-id">slug: ${escapeHtml(tab.slug)}</span>` : ''}
                ${tab.shortId ? `<span class="context-id">id: ${escapeHtml(tab.shortId)}</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Full Query Section (if different from query) -->
    ${metadata.fullQuery && metadata.fullQuery !== metadata.query ? `
    <div class="section fullquery-section">
      <div class="section-label">Full Query (with context)</div>
      <div class="fullquery-content">${escapeHtml(metadata.fullQuery)}</div>
    </div>
    ` : ''}

    <!-- Error Section -->
    ${metadata.error ? `
    <div class="section error-section">
      <div class="section-label">Error</div>
      <div class="error-content">${escapeHtml(metadata.error)}</div>
    </div>
    ` : ''}

    <!-- Response Section -->
    <div class="section response-section">
      <div class="section-label">Response</div>
      <div class="metadata">
        ${metadata.model ? `<span class="metadata-item"><span class="metadata-label">Model:</span> <span class="metadata-value">${escapeHtml(metadata.model)}</span></span>` : ''}
        ${metadata.tokensIn ? `<span class="metadata-item"><span class="metadata-label">Tokens In:</span> <span class="metadata-value">${metadata.tokensIn.toLocaleString()}</span></span>` : ''}
        ${metadata.tokensOut ? `<span class="metadata-item"><span class="metadata-label">Tokens Out:</span> <span class="metadata-value">${metadata.tokensOut.toLocaleString()}</span></span>` : ''}
        ${metadata.tokensIn && metadata.tokensOut ? `<span class="metadata-item"><span class="metadata-label">Total:</span> <span class="metadata-value">${(metadata.tokensIn + metadata.tokensOut).toLocaleString()}</span></span>` : ''}
      </div>
      <div class="response-content">${escapeHtml(metadata.response || '')}</div>
    </div>

    <!-- JSON Section -->
    <div class="section json-section">
      <div class="json-header">
        <div class="section-label">Full Metadata (JSON)</div>
        <button class="copy-btn" onclick="copyJSON()">Copy JSON</button>
      </div>
      <div class="json-content" id="json-content">${escapeHtml(JSON.stringify(metadata, null, 2))}</div>
    </div>
  </div>

  <script>
    function copyJSON() {
      const text = document.getElementById('json-content').textContent;
      const btn = document.querySelector('.copy-btn');
      const originalText = btn.textContent;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = originalText; }, 2000);
        }).catch(() => {
          fallbackCopy(text, btn, originalText);
        });
      } else {
        fallbackCopy(text, btn, originalText);
      }
    }

    function fallbackCopy(text, btn, originalText) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        btn.textContent = 'Copied!';
      } catch (err) {
        btn.textContent = 'Failed';
      }
      setTimeout(() => { btn.textContent = originalText; }, 2000);
      document.body.removeChild(textarea);
    }
  </script>
</body>
</html>
  `.trim();
}
