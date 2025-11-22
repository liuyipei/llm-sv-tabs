/**
 * HTML template generator for raw message viewer tabs
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
        return `"${escapeHtml(abbreviate(obj, 500))}"`;
      }
      return `"${escapeHtml(obj)}"`;
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
        return `${nextIndent}"${escapeHtml(key)}": ${value}`;
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
          <div class="stat-value" style="font-size: 14px;">${escapeHtml(metadata.model)}</div>
        </div>
      ` : ''}
    </div>

    <div class="section">
      <div class="section-title">Query</div>
      <div class="field">
        <div class="field-value">${escapeHtml(metadata.query || '')}</div>
      </div>
    </div>

    ${metadata.fullQuery && metadata.fullQuery !== metadata.query ? `
      <div class="section">
        <div class="section-title">Full Query (with context)</div>
        <div class="field">
          <div class="field-value">${escapeHtml(abbreviate(metadata.fullQuery, 2000))}</div>
        </div>
      </div>
    ` : ''}

    ${metadata.selectedTabIds && metadata.selectedTabIds.length > 0 ? `
      <div class="section">
        <div class="section-title">Selected Tabs</div>
        <div class="field">
          <div class="field-value">${metadata.selectedTabIds.map((id: string) => escapeHtml(id)).join(', ')}</div>
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Response</div>
      <div class="field">
        <div class="field-value">${escapeHtml(abbreviate(metadata.response || '', 2000))}</div>
      </div>
    </div>

    ${metadata.error ? `
      <div class="section" style="border-left-color: #f48771;">
        <div class="section-title" style="color: #f48771;">Error</div>
        <div class="field">
          <div class="field-value">${escapeHtml(metadata.error)}</div>
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
