import { extname } from 'path';

/**
 * Escape HTML special characters for safe rendering.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get MIME type based on file extension.
 */
export function getMimeType(filePath: string, fileType: 'image' | 'pdf'): string {
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

/**
 * Create HTML content for file error display.
 */
export function createFileErrorHTML(title: string, errorMessage: string, filePath: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #1e1e1e;
      color: #cccccc;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .error-container {
      text-align: center;
      max-width: 500px;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    .error-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #f48771;
    }
    .error-message {
      font-size: 14px;
      color: #999;
      margin-bottom: 15px;
    }
    .file-path {
      font-size: 12px;
      color: #666;
      word-break: break-all;
      background: #2d2d2d;
      padding: 8px 12px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">&#128463;</div>
    <div class="error-title">File Not Available</div>
    <div class="error-message">${escapeHtml(errorMessage)}</div>
    <div class="file-path">${escapeHtml(filePath)}</div>
  </div>
</body>
</html>`;
}
