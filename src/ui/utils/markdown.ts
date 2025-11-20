import { marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import DOMPurify from 'dompurify';

/**
 * Configure marked with custom renderer for code highlighting and math
 */
function configureMarked(): void {
  const renderer = new marked.Renderer();

  // Override code block rendering with syntax highlighting
  renderer.code = function (token: { text: string; lang?: string } | string, language?: string): string {
    // Handle both token object (new API) and string (old API)
    const code = typeof token === 'string' ? token : token.text;
    const lang = typeof token === 'string' ? language : token.lang;

    const validLanguage = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(code, { language: validLanguage }).value;
    return `<pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre>`;
  };

  // Override inline code rendering
  renderer.codespan = function (token: { text: string } | string): string {
    const code = typeof token === 'string' ? token : token.text;
    return `<code class="inline-code">${code}</code>`;
  };

  marked.setOptions({
    renderer,
    breaks: true, // Enable GFM line breaks
    gfm: true, // GitHub Flavored Markdown
  });
}

// Initialize marked configuration
configureMarked();

/**
 * Process math expressions in text
 * Supports both inline ($...$) and display ($$...$$) math
 */
function processMath(html: string): string {
  // Process display math ($$...$$) first to avoid conflicts
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch (e) {
      return `<span class="math-error">$$${math}$$</span>`;
    }
  });

  // Process inline math ($...$)
  html = html.replace(/\$([^$]+)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch (e) {
      return `<span class="math-error">$${math}$</span>`;
    }
  });

  return html;
}

/**
 * Render markdown to sanitized HTML with syntax highlighting and math support
 */
export function renderMarkdown(markdown: string): string {
  // First, parse markdown to HTML
  const rawHtml = marked.parse(markdown) as string;

  // Process math expressions
  const htmlWithMath = processMath(rawHtml);

  // Sanitize HTML to prevent XSS
  const sanitized = DOMPurify.sanitize(htmlWithMath, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
      // KaTeX elements
      'span', 'annotation', 'semantics', 'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
      'mfrac', 'mtext', 'mspace', 'menclose', 'mstyle', 'mtable', 'mtr', 'mtd',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style',
      // KaTeX attributes
      'aria-hidden', 'xmlns', 'width', 'height', 'viewBox',
      'preserveAspectRatio', 'stroke-width', 'stroke', 'fill',
    ],
  });

  return sanitized;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
