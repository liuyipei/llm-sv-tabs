import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderMarkdown, copyToClipboard } from '../../src/ui/utils/markdown';

describe('Markdown Renderer', () => {
  describe('Basic Markdown', () => {
    it('should render paragraphs', () => {
      const input = 'This is a paragraph.';
      const result = renderMarkdown(input);
      expect(result).toContain('<p>This is a paragraph.</p>');
    });

    it('should render headings', () => {
      const input = '# Heading 1\n## Heading 2';
      const result = renderMarkdown(input);
      expect(result).toContain('<h1>Heading 1</h1>');
      expect(result).toContain('<h2>Heading 2</h2>');
    });

    it('should render bold and italic', () => {
      const input = '**bold** and *italic*';
      const result = renderMarkdown(input);
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('should render lists', () => {
      const input = '- Item 1\n- Item 2\n- Item 3';
      const result = renderMarkdown(input);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
    });

    it('should render links', () => {
      const input = '[Example](https://example.com)';
      const result = renderMarkdown(input);
      expect(result).toContain('<a href="https://example.com">Example</a>');
    });
  });

  describe('Code Highlighting', () => {
    it('should render inline code', () => {
      const input = 'Use `console.log()` to debug';
      const result = renderMarkdown(input);
      expect(result).toContain('<code class="inline-code">console.log()</code>');
    });

    it('should render code blocks with syntax highlighting', () => {
      const input = '```javascript\nconst x = 42;\n```';
      const result = renderMarkdown(input);
      expect(result).toContain('<pre>');
      expect(result).toContain('<code class="hljs language-javascript">');
      expect(result).toContain('const');
      expect(result).toContain('42');
    });

    it('should handle code blocks without language', () => {
      const input = '```\nPlain text\n```';
      const result = renderMarkdown(input);
      expect(result).toContain('<pre>');
      expect(result).toContain('language-plaintext');
    });

    it('should handle multiple code blocks', () => {
      const input = '```js\nconst a = 1;\n```\n\nSome text\n\n```python\nx = 2\n```';
      const result = renderMarkdown(input);
      expect(result).toContain('language-js');
      expect(result).toContain('language-python');
    });
  });

  describe('Math Rendering', () => {
    it('should render inline math', () => {
      const input = 'The equation $E = mc^2$ is famous';
      const result = renderMarkdown(input);
      // KaTeX should render math expressions
      expect(result).toContain('katex');
      expect(result).not.toContain('$E = mc^2$'); // Should be replaced
    });

    it('should render display math', () => {
      const input = '$$\\int_0^1 x^2 dx$$';
      const result = renderMarkdown(input);
      // KaTeX should render math expressions
      expect(result).toContain('katex');
    });

    it('should handle math rendering errors gracefully', () => {
      const input = '$invalid\\math\\syntax$';
      const result = renderMarkdown(input);
      // Should either render or show error, but not crash
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle both inline and display math together', () => {
      const input = 'Inline $x^2$ and display $$y = mx + b$$';
      const result = renderMarkdown(input);
      expect(result).toContain('katex');
      expect(result).not.toContain('$x^2$');
      expect(result).not.toContain('$$y = mx + b$$');
    });
  });

  describe('XSS Protection', () => {
    it('should sanitize script tags', () => {
      const input = '<script>alert("xss")</script>';
      const result = renderMarkdown(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should sanitize onclick handlers', () => {
      const input = '<img src="x" onclick="alert(1)">';
      const result = renderMarkdown(input);
      expect(result).not.toContain('onclick');
    });

    it('should allow safe HTML elements', () => {
      const input = '<strong>Bold text</strong>';
      const result = renderMarkdown(input);
      expect(result).toContain('<strong>Bold text</strong>');
    });

    it('should sanitize javascript: URLs', () => {
      const input = '[Click me](javascript:alert(1))';
      const result = renderMarkdown(input);
      expect(result).not.toContain('javascript:');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed content correctly', () => {
      const input = `# Title

**Bold text** with *italic* and code: \`const x = 42\`

\`\`\`javascript
function hello() {
  console.log('world');
}
\`\`\`

Math: $E = mc^2$

- List item 1
- List item 2`;

      const result = renderMarkdown(input);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>Bold text</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code class="inline-code">const x = 42</code>');
      expect(result).toContain('language-javascript');
      expect(result).toContain('katex');
      expect(result).toContain('<li>');
    });

    it('should preserve whitespace in code blocks', () => {
      const input = '```\n  indented\n    more indented\n```';
      const result = renderMarkdown(input);
      expect(result).toContain('indented');
    });
  });
});

describe('Clipboard Utilities', () => {
  beforeEach(() => {
    // Mock clipboard API
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('should copy text to clipboard', async () => {
    const text = 'Hello, world!';
    const result = await copyToClipboard(text);

    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
  });

  it('should handle clipboard errors', async () => {
    // Mock clipboard error
    global.navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));

    const result = await copyToClipboard('test');
    expect(result).toBe(false);
  });
});
