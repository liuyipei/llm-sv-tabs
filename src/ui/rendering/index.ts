/**
 * Message Rendering Pipeline
 *
 * This module provides a unified interface for rendering assistant message content
 * in different modes (markdown vs raw text).
 *
 * Architecture:
 * - Input: message text (string) + render mode + optional metadata
 * - Output: renderable representation (HTML for markdown, escaped text for raw)
 *
 * Future Extension Points:
 * - normalizeMarkdown(): Pre-processing hook for markdown normalization/smoothing
 * - See docs/rendering-modes.md for details on future heuristics
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';

// ============================================================================
// Types
// ============================================================================

export type RenderMode = 'markdown' | 'raw';

export interface RenderOptions {
  mode: RenderMode;
  metadata?: {
    provider?: string;
    model?: string;
    isStreaming?: boolean;
  };
}

export interface RenderResult {
  html: string;
  mode: RenderMode;
}

// ============================================================================
// Markdown Normalization (Future Extension Point)
// ============================================================================

/**
 * Normalize markdown text before rendering.
 *
 * This is a placeholder for future markdown normalization/smoothing heuristics.
 * Currently a no-op that returns the input unchanged.
 *
 * Future heuristics that could be implemented here:
 * - Fence length normalization (standardize backtick counts)
 * - Auto-closing unclosed fences (especially during streaming)
 * - List repair (fix incomplete list items)
 * - Streaming boundary stabilization (prevent partial token rendering issues)
 * - Nested fence handling (balance backticks vs tildes)
 *
 * Implementation notes:
 * - Should be idempotent (normalizing twice = same result)
 * - Should preserve semantic meaning
 * - Should be fast (called on every render during streaming)
 *
 * @param text - The raw markdown text
 * @param options - Optional normalization options
 * @returns Normalized markdown text
 */
export function normalizeMarkdown(text: string, _options?: { isStreaming?: boolean }): string {
  // No-op placeholder - future implementations go here
  // See docs/rendering-modes.md for planned heuristics
  return text;
}

// ============================================================================
// Markdown Rendering
// ============================================================================

// Configure marked with custom renderer
let markedConfigured = false;

function ensureMarkedConfigured(): void {
  if (markedConfigured) return;

  const renderer = new marked.Renderer();

  // Override code block rendering with syntax highlighting and action buttons
  renderer.code = function (token: { text: string; lang?: string } | string, language?: string): string {
    const code = typeof token === 'string' ? token : token.text;
    const lang = typeof token === 'string' ? language : token.lang;

    const validLanguage = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(code, { language: validLanguage }).value;

    // Encode the code content for the data attribute (base64 to handle special chars)
    const encodedCode = btoa(unescape(encodeURIComponent(code)));
    const displayLang = lang || 'text';

    // Header-based design: header above pre, visually seamless
    // SVG icons: clipboard for copy, external-link for note
    const copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
    const noteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';

    // Inline styles to guarantee layout and appearance
    // Wrapper background matches github-dark hljs theme (#0d1117)
    const wrapperStyle = 'background:#0d1117;border-radius:8px;overflow:hidden;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);';
    const headerStyle = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.1);';
    const langStyle = 'font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.5);';
    const actionsStyle = 'display:flex;align-items:center;gap:8px;';
    const btnStyle = 'background:transparent;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:inherit;opacity:0.5;';

    return `<div class="code-block-wrapper" style="${wrapperStyle}"><div class="code-block-header" style="${headerStyle}"><span class="code-lang-label" style="${langStyle}">${displayLang}</span><div class="code-block-actions" style="${actionsStyle}"><button class="code-action-btn" style="${btnStyle}" data-action="copy" data-code="${encodedCode}" title="Copy code">${copyIcon}</button><button class="code-action-btn" style="${btnStyle}" data-action="open-note" data-code="${encodedCode}" data-lang="${displayLang}" title="Open in new note">${noteIcon}</button></div></div><pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre></div>`;
  };

  // Override inline code rendering
  renderer.codespan = function (token: { text: string } | string): string {
    const code = typeof token === 'string' ? token : token.text;
    return `<code class="inline-code">${code}</code>`;
  };

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true,
  });

  markedConfigured = true;
}

/**
 * Process math expressions in text.
 * Supports both inline ($...$) and display ($$...$$) math.
 */
function processMath(html: string): string {
  // Process display math ($$...$$) first to avoid conflicts
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
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
    } catch {
      return `<span class="math-error">$${math}$</span>`;
    }
  });

  return html;
}

/**
 * Render markdown to sanitized HTML.
 */
function renderMarkdownToHtml(text: string, isStreaming = false): string {
  ensureMarkedConfigured();

  // Apply normalization (currently no-op, future extension point)
  const normalized = normalizeMarkdown(text, { isStreaming });

  // Parse markdown to HTML
  const rawHtml = marked.parse(normalized) as string;

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
      'button', // For code block action buttons
      // SVG elements for icons
      'svg', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'g',
      // KaTeX elements
      'annotation', 'semantics', 'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub',
      'mfrac', 'mtext', 'mspace', 'menclose', 'mstyle', 'mtable', 'mtr', 'mtd',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style',
      // Code block action button attributes
      'data-action', 'data-code', 'data-lang',
      // SVG attributes
      'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'd', 'x', 'y', 'rx', 'ry', 'r', 'cx', 'cy',
      'x1', 'y1', 'x2', 'y2', 'points', 'transform',
      // KaTeX attributes
      'aria-hidden', 'preserveAspectRatio',
    ],
  });

  return sanitized;
}

// ============================================================================
// Raw Text Rendering
// ============================================================================

/**
 * Escape HTML entities for safe raw text display.
 * This ensures that any HTML/Markdown in the text is displayed literally.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render text for raw display (no markdown parsing).
 * Preserves whitespace and newlines, escapes HTML.
 */
function renderRawText(text: string): string {
  // Escape HTML to display it literally
  const escaped = escapeHtml(text);

  // Wrap in a pre-formatted container to preserve whitespace
  // The CSS class 'raw-text-content' handles the styling
  return `<div class="raw-text-content">${escaped}</div>`;
}

// ============================================================================
// Main Rendering Pipeline
// ============================================================================

/**
 * Render message content based on the specified mode.
 *
 * @param text - The message text to render
 * @param options - Rendering options including mode and metadata
 * @returns RenderResult with HTML and mode used
 */
export function renderMessage(text: string, options: RenderOptions): RenderResult {
  const { mode, metadata } = options;
  const isStreaming = metadata?.isStreaming ?? false;

  if (mode === 'raw') {
    return {
      html: renderRawText(text),
      mode: 'raw',
    };
  }

  return {
    html: renderMarkdownToHtml(text, isStreaming),
    mode: 'markdown',
  };
}

/**
 * Render markdown content (convenience wrapper for backward compatibility).
 * Use renderMessage() for new code.
 */
export function renderMarkdown(text: string, isStreaming = false): string {
  return renderMarkdownToHtml(text, isStreaming);
}

/**
 * Render raw text content (convenience wrapper).
 */
export function renderRaw(text: string): string {
  return renderRawText(text);
}

// Re-export escape function for use in components
export { escapeHtml };
