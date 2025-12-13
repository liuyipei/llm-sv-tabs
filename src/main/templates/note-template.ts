/**
 * HTML template generator for note tabs
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createNoteHTML(title: string, content: string, fileType: 'text' | 'pdf' | 'image'): string {
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
  <title>${escapeHtml(title)}</title>
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
  <h1>${escapeHtml(title)}</h1>
  <div class="image-container">
    <img src="${content}" alt="${escapeHtml(title)}" />
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
  <title>${escapeHtml(title)}</title>
  <style>
    ${baseStyles}
    body { padding: 0; overflow: hidden; }
    .pdf-container {
      width: 100%;
      height: 100vh;
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
  <title>${escapeHtml(title)}</title>
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
  <h1>${escapeHtml(title)}</h1>
  <div class="note-content">${escapeHtml(content)}</div>
</body>
</html>
  `.trim();
}
