import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { WebContentsView } from 'electron';

/**
 * Smart Content Extraction Result
 *
 * Represents extracted content that's been processed differently based on page type:
 * - Articles (blogs, news): Converted to Markdown for readability
 * - Apps (SPAs, dashboards): Simplified semantic HTML preserving structure
 */
export interface SmartContent {
  type: 'article' | 'app';
  title: string;
  url: string;
  content: string; // Markdown for articles, simplified HTML for apps
  tokenEstimate: number;
}

/**
 * Smart Content Extractor
 *
 * Intelligently extracts webpage content for LLM consumption by:
 * 1. Getting raw HTML from the browser
 * 2. Determining if page is article-like or app-like
 * 3. Processing accordingly:
 *    - Articles: Use Mozilla Readability → Convert to Markdown
 *    - Apps: Walk DOM tree → Output simplified semantic HTML
 * 4. Respecting token budgets
 *
 * Benefits over manual extraction:
 * - Structure preservation (via Markdown headings or HTML tags)
 * - Token-aware limiting (not arbitrary element counts)
 * - Semantic awareness (different strategies for different content types)
 * - Whitespace normalization (context-aware)
 */
export class SmartContentExtractor {
  /**
   * Extract raw HTML from browser page
   */
  private static async getPageHTML(view: WebContentsView): Promise<string> {
    return view.webContents.executeJavaScript(`document.documentElement.outerHTML`);
  }

  /**
   * Main extraction entry point
   *
   * @param view - WebContentsView to extract from
   * @param tokenBudget - Approximate token limit (1 token ≈ 4 chars)
   * @returns SmartContent with type, title, url, content, and token estimate
   */
  static async extract(
    view: WebContentsView,
    tokenBudget = 12500 // ~50K chars, reasonable default
  ): Promise<SmartContent> {
    const html = await this.getPageHTML(view);
    const url = view.webContents.getURL();

    // Parse HTML using JSDOM (runs in Node.js, not browser)
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Route based on content type
    if (this.isProbablyArticle(doc)) {
      return this.extractAsArticle(doc, url, tokenBudget);
    } else {
      return this.extractAsApp(doc, url, tokenBudget);
    }
  }

  /**
   * Heuristic to determine if page is article-like
   *
   * Checks for:
   * - Semantic tags (article, main)
   * - Text density vs link density (articles have more text)
   *
   * @param doc - JSDOM Document
   * @returns true if page appears to be an article
   */
  private static isProbablyArticle(doc: Document): boolean {
    // Check for article indicators
    const hasArticleTag = doc.querySelector('article') !== null;
    const hasMainTag = doc.querySelector('main') !== null;

    // Calculate text density
    const paragraphs = doc.querySelectorAll('p');
    const totalTextLength = Array.from(paragraphs).reduce(
      (sum, p) => sum + (p.textContent?.length || 0),
      0
    );

    const links = doc.querySelectorAll('a');
    const totalLinkLength = Array.from(links).reduce(
      (sum, a) => sum + (a.textContent?.length || 0),
      0
    );

    const textDensity = totalTextLength / (totalLinkLength + 1);

    // Article if: has semantic tags OR high text-to-link ratio
    return hasArticleTag || hasMainTag || textDensity > 3;
  }

  /**
   * Extract article content using Mozilla Readability + Turndown
   *
   * Pipeline:
   * 1. Readability extracts main content and cleans up boilerplate
   * 2. Turndown converts HTML to Markdown
   * 3. Truncate to token budget
   *
   * @param doc - JSDOM Document
   * @param url - Page URL
   * @param budget - Token budget
   * @returns SmartContent with Markdown content
   */
  private static extractAsArticle(
    doc: Document,
    url: string,
    budget: number
  ): SmartContent {
    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article) {
      // Readability failed, fallback to app mode
      return this.extractAsApp(doc, url, budget);
    }

    // Convert HTML to Markdown for better LLM comprehension
    const turndown = new TurndownService({
      headingStyle: 'atx', // Use # style headings
      codeBlockStyle: 'fenced', // Use ``` code blocks
    });

    // Remove noisy elements
    turndown.remove(['script', 'style', 'iframe']);

    let markdown = turndown.turndown(article.content || '');

    // Respect token budget (1 token ≈ 4 chars)
    const maxChars = budget * 4;
    if (markdown.length > maxChars) {
      markdown = markdown.substring(0, maxChars) + '\n\n...(truncated)';
    }

    return {
      type: 'article',
      title: article.title || 'Untitled',
      url,
      content: markdown,
      tokenEstimate: Math.ceil(markdown.length / 4),
    };
  }

  /**
   * Extract app content using recursive DOM walker
   *
   * Strategy:
   * 1. Walk DOM tree recursively
   * 2. Skip noise (scripts, styles, hidden elements)
   * 3. Preserve semantic structure (tags, important attributes)
   * 4. Flatten unnecessary divs
   * 5. Normalize whitespace within text nodes
   * 6. Stop when token budget exhausted
   *
   * @param doc - JSDOM Document
   * @param url - Page URL
   * @param budget - Token budget
   * @returns SmartContent with simplified HTML
   */
  private static extractAsApp(
    doc: Document,
    url: string,
    budget: number
  ): SmartContent {
    const maxChars = budget * 4;
    let charCount = 0;

    const walk = (node: Node): string | null => {
      if (charCount > maxChars) return null;

      // Handle text nodes
      if (node.nodeType === 3) {
        // TEXT_NODE
        const text = node.textContent?.trim().replace(/\s+/g, ' ');
        if (!text) return null;
        charCount += text.length;
        return text;
      }

      // Handle element nodes
      if (node.nodeType === 1) {
        // ELEMENT_NODE
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        // Skip noise elements
        if (['script', 'style', 'noscript', 'svg', 'iframe'].includes(tag)) {
          return null;
        }

        // Skip hidden elements
        if (el instanceof HTMLElement) {
          if (el.style.display === 'none' || el.style.visibility === 'hidden') {
            return null;
          }
        }

        // Preserve important attributes for context
        const attrs: string[] = [];
        const href = el.getAttribute('href');
        if (href) attrs.push(`href="${href}"`);
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) attrs.push(`aria-label="${ariaLabel}"`);
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) attrs.push(`placeholder="${placeholder}"`);
        const type = el.getAttribute('type');
        if (type) attrs.push(`type="${type}"`);
        const role = el.getAttribute('role');
        if (role) attrs.push(`role="${role}"`);

        // Recursively process children
        const children = Array.from(node.childNodes)
          .map(walk)
          .filter(Boolean)
          .join('');

        // Flatten unnecessary divs (no attributes, short text content, no nested tags)
        if (tag === 'div' && attrs.length === 0 && children.length < 100 && !children.includes('<')) {
          return children;
        }

        // Skip empty containers (unless void elements)
        const isVoid = ['img', 'input', 'br', 'hr'].includes(tag);
        if (!children && !isVoid) return null;

        // Output simplified HTML
        const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
        return `<${tag}${attrStr}>${children}</${tag}>\n`;
      }

      return null;
    };

    const content = walk(doc.body) || '';

    return {
      type: 'app',
      title: doc.title || 'Untitled',
      url,
      content,
      tokenEstimate: Math.ceil(content.length / 4),
    };
  }
}
