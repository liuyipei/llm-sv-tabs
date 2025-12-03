import type { SerializedDOM } from '../../types';
import { normalizeWhitespace } from './text-normalizer.js';

/**
 * Maximum number of links to include in formatted output
 */
export const MAX_LINKS = 100;

/**
 * Format SerializedDOM into markdown-style structured text
 *
 * Provides complete structured representation with:
 * - Headings (document outline)
 * - Paragraphs (main content)
 * - Links (up to MAX_LINKS)
 * - Meta tags (SEO metadata)
 *
 * Falls back to mainContent if structured data is unavailable
 */
export function formatSerializedDOM(dom: SerializedDOM): string {
  const parts: string[] = [];

  // Check if we have structured data
  const hasStructuredData =
    (dom.headings && dom.headings.length > 0) ||
    (dom.paragraphs && dom.paragraphs.length > 0) ||
    (dom.links && dom.links.length > 0);

  // If no structured data, fall back to mainContent
  if (!hasStructuredData) {
    return dom.mainContent ? normalizeWhitespace(dom.mainContent) : '';
  }

  // Add headings (document structure)
  if (dom.headings && dom.headings.length > 0) {
    parts.push('## Document Structure\n');
    dom.headings.forEach(heading => {
      parts.push(`- ${heading}`);
    });
    parts.push(''); // Empty line
  }

  // Add meta tags (SEO/metadata)
  if (dom.metaTags && Object.keys(dom.metaTags).length > 0) {
    parts.push('## Metadata\n');

    // Prioritize common meta tags
    const priorityKeys = ['description', 'keywords', 'og:title', 'og:description', 'twitter:description'];
    const addedKeys = new Set<string>();

    // Add priority meta tags first
    priorityKeys.forEach(key => {
      if (dom.metaTags[key]) {
        parts.push(`**${key}**: ${dom.metaTags[key]}`);
        addedKeys.add(key);
      }
    });

    // Add remaining meta tags
    Object.entries(dom.metaTags).forEach(([key, value]) => {
      if (!addedKeys.has(key)) {
        parts.push(`**${key}**: ${value}`);
      }
    });

    parts.push(''); // Empty line
  }

  // Add main content (paragraphs)
  if (dom.paragraphs && dom.paragraphs.length > 0) {
    parts.push('## Content\n');
    parts.push(dom.paragraphs.join('\n\n'));
    parts.push(''); // Empty line
  }

  // Add links
  if (dom.links && dom.links.length > 0) {
    const linksToShow = dom.links.slice(0, MAX_LINKS);
    parts.push('## Links\n');
    linksToShow.forEach(link => {
      // Use markdown link format
      parts.push(`- [${link.text}](${link.href})`);
    });

    // Note if we truncated links
    if (dom.links.length > MAX_LINKS) {
      parts.push(`\n*(${dom.links.length - MAX_LINKS} more links not shown)*`);
    }
  }

  return parts.join('\n');
}
