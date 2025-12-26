import { describe, it, expect } from 'vitest';
import {
  renderMessage,
  renderMarkdown,
  renderRaw,
  normalizeMarkdown,
  escapeHtml,
  type RenderMode,
} from '../../src/ui/rendering';

describe('renderMessage', () => {
  describe('markdown mode', () => {
    it('should render headings correctly', () => {
      const text = '# Heading 1\n## Heading 2\n### Heading 3';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.mode).toBe('markdown');
      expect(result.html).toContain('<h1>');
      expect(result.html).toContain('<h2>');
      expect(result.html).toContain('<h3>');
      expect(result.html).toContain('Heading 1');
      expect(result.html).toContain('Heading 2');
      expect(result.html).toContain('Heading 3');
    });

    it('should render lists correctly', () => {
      const unorderedList = '- Item 1\n- Item 2\n- Item 3';
      const orderedList = '1. First\n2. Second\n3. Third';

      const unorderedResult = renderMessage(unorderedList, { mode: 'markdown' });
      const orderedResult = renderMessage(orderedList, { mode: 'markdown' });

      expect(unorderedResult.html).toContain('<ul>');
      expect(unorderedResult.html).toContain('<li>');
      expect(orderedResult.html).toContain('<ol>');
      expect(orderedResult.html).toContain('<li>');
    });

    it('should render code fences with backticks', () => {
      const text = '```javascript\nconst x = 1;\n```';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<pre>');
      expect(result.html).toContain('<code');
      expect(result.html).toContain('const');
    });

    it('should render code fences with tildes', () => {
      const text = '~~~python\nprint("hello")\n~~~';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<pre>');
      expect(result.html).toContain('<code');
      expect(result.html).toContain('print');
    });

    it('should handle triple backticks inside longer fences', () => {
      // When showing markdown code in markdown, use 4+ backticks for outer fence
      const text = '````markdown\n```javascript\nconst x = 1;\n```\n````';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<pre>');
      expect(result.html).toContain('```javascript');
    });

    it('should sanitize potentially dangerous HTML', () => {
      const text = '<script>alert("xss")</script>\n\nSafe content';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).not.toContain('<script>');
      expect(result.html).not.toContain('alert');
      expect(result.html).toContain('Safe content');
    });

    it('should render inline code', () => {
      const text = 'Use `const` for constants';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<code class="inline-code">');
      expect(result.html).toContain('const');
    });

    it('should render bold and italic', () => {
      const text = '**bold** and *italic* and ***both***';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<strong>bold</strong>');
      expect(result.html).toContain('<em>italic</em>');
    });

    it('should render blockquotes', () => {
      const text = '> This is a quote';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<blockquote>');
    });

    it('should render tables', () => {
      const text = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |';
      const result = renderMessage(text, { mode: 'markdown' });

      expect(result.html).toContain('<table>');
      expect(result.html).toContain('<th>');
      expect(result.html).toContain('<td>');
    });
  });

  describe('raw mode', () => {
    it('should escape HTML tags and display literally', () => {
      const text = '<script>alert("xss")</script>';
      const result = renderMessage(text, { mode: 'raw' });

      expect(result.mode).toBe('raw');
      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).toContain('&lt;/script&gt;');
      expect(result.html).not.toContain('<script>');
    });

    it('should preserve markdown syntax literally', () => {
      const text = '# Heading\n**bold**\n- list item';
      const result = renderMessage(text, { mode: 'raw' });

      expect(result.html).toContain('# Heading');
      expect(result.html).toContain('**bold**');
      expect(result.html).toContain('- list item');
      expect(result.html).not.toContain('<h1>');
      expect(result.html).not.toContain('<strong>');
    });

    it('should preserve whitespace and newlines', () => {
      const text = 'Line 1\n\n  Indented line\n\nLine 3';
      const result = renderMessage(text, { mode: 'raw' });

      expect(result.html).toContain('Line 1');
      expect(result.html).toContain('Indented line');
      expect(result.html).toContain('Line 3');
      // The raw-text-content wrapper preserves whitespace via CSS
      expect(result.html).toContain('raw-text-content');
    });

    it('should escape special characters', () => {
      const text = '& < > " \'';
      const result = renderMessage(text, { mode: 'raw' });

      expect(result.html).toContain('&amp;');
      expect(result.html).toContain('&lt;');
      expect(result.html).toContain('&gt;');
      expect(result.html).toContain('&quot;');
      expect(result.html).toContain('&#039;');
    });

    it('should preserve code fences literally', () => {
      const text = '```javascript\nconst x = 1;\n```';
      const result = renderMessage(text, { mode: 'raw' });

      expect(result.html).toContain('```javascript');
      expect(result.html).toContain('const x = 1;');
      expect(result.html).toContain('```');
      expect(result.html).not.toContain('<pre>');
    });
  });
});

describe('renderMarkdown (convenience function)', () => {
  it('should render markdown and return HTML string', () => {
    const text = '# Hello World';
    const result = renderMarkdown(text);

    expect(typeof result).toBe('string');
    expect(result).toContain('<h1>');
    expect(result).toContain('Hello World');
  });
});

describe('renderRaw (convenience function)', () => {
  it('should render raw text and return HTML string', () => {
    const text = '# Not a heading';
    const result = renderRaw(text);

    expect(typeof result).toBe('string');
    expect(result).toContain('# Not a heading');
    expect(result).not.toContain('<h1>');
  });
});

describe('normalizeMarkdown', () => {
  it('should be a no-op by default (placeholder)', () => {
    const text = '# Heading\n\n```\ncode\n```';
    const result = normalizeMarkdown(text);

    // Currently a no-op, returns input unchanged
    expect(result).toBe(text);
  });

  it('should accept streaming option', () => {
    const text = '# Partial response...';
    const result = normalizeMarkdown(text, { isStreaming: true });

    // Currently a no-op
    expect(result).toBe(text);
  });
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('should escape multiple characters in a string', () => {
    const result = escapeHtml('<div class="test">Hello & World</div>');
    expect(result).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; World&lt;/div&gt;');
  });

  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('streaming behavior', () => {
  it('should handle incremental text updates in markdown mode', () => {
    let text = '';
    const chunks = ['# Hello', '\n\nThis is ', 'streaming ', 'content'];

    for (const chunk of chunks) {
      text += chunk;
      const result = renderMessage(text, {
        mode: 'markdown',
        metadata: { isStreaming: true },
      });

      expect(result.mode).toBe('markdown');
      expect(typeof result.html).toBe('string');
    }

    // Final result should have all content
    const finalResult = renderMessage(text, {
      mode: 'markdown',
      metadata: { isStreaming: false },
    });
    expect(finalResult.html).toContain('Hello');
    expect(finalResult.html).toContain('streaming');
    expect(finalResult.html).toContain('content');
  });

  it('should handle incremental text updates in raw mode', () => {
    let text = '';
    const chunks = ['# Hello', '\n\n```js\n', 'const x = 1;', '\n```'];

    for (const chunk of chunks) {
      text += chunk;
      const result = renderMessage(text, {
        mode: 'raw',
        metadata: { isStreaming: true },
      });

      expect(result.mode).toBe('raw');
      expect(typeof result.html).toBe('string');
    }

    // Final result should preserve raw text
    const finalResult = renderMessage(text, { mode: 'raw' });
    expect(finalResult.html).toContain('# Hello');
    expect(finalResult.html).toContain('```js');
    expect(finalResult.html).toContain('const x = 1;');
  });
});

describe('edge cases', () => {
  it('should handle empty string', () => {
    const markdownResult = renderMessage('', { mode: 'markdown' });
    const rawResult = renderMessage('', { mode: 'raw' });

    expect(markdownResult.html).toBeDefined();
    expect(rawResult.html).toBeDefined();
  });

  it('should handle nested fences (backticks inside tildes)', () => {
    const text = '~~~markdown\n```js\ncode\n```\n~~~';
    const result = renderMessage(text, { mode: 'markdown' });

    expect(result.html).toContain('```js');
  });

  it('should handle very long lines', () => {
    const longLine = 'a'.repeat(10000);
    const markdownResult = renderMessage(longLine, { mode: 'markdown' });
    const rawResult = renderMessage(longLine, { mode: 'raw' });

    expect(markdownResult.html).toContain('a');
    expect(rawResult.html).toContain('a');
  });

  it('should handle unicode characters', () => {
    const text = '# Hello World\n\nEmoji: \nChinese: \nSymbols: \u00a9\u00ae\u2122';
    const result = renderMessage(text, { mode: 'markdown' });

    expect(result.html).toContain('\u00a9');
    expect(result.html).toContain('\u00ae');
  });
});
