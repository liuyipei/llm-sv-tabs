/**
 * DOM-based text search utility for searching within Svelte component tabs.
 * Provides text search and highlighting functionality as an alternative to
 * Electron's webContents.findInPage() for rendered Svelte components.
 */

export interface DOMSearchResult {
  totalMatches: number;
  activeMatchIndex: number;
}

export interface DOMSearchInstance {
  search(text: string): DOMSearchResult;
  findNext(): DOMSearchResult;
  findPrevious(): DOMSearchResult;
  clear(): void;
  destroy(): void;
}

const HIGHLIGHT_CLASS = 'dom-search-highlight';
const ACTIVE_HIGHLIGHT_CLASS = 'dom-search-highlight-active';

/**
 * Creates a DOM search instance for a given container element.
 * Supports searching, highlighting, and navigating through matches.
 */
export function createDOMSearch(container: HTMLElement): DOMSearchInstance {
  let matches: HTMLElement[] = [];
  let activeIndex = 0;

  /**
   * Recursively walks through all text nodes in the container
   */
  function getTextNodes(node: Node): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    let currentNode: Text | null;
    while ((currentNode = walker.nextNode() as Text | null)) {
      // Skip empty text nodes and nodes inside script/style tags
      if (currentNode.textContent?.trim() &&
          !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(currentNode.parentElement?.tagName || '')) {
        textNodes.push(currentNode);
      }
    }
    return textNodes;
  }

  /**
   * Removes all existing highlights
   */
  function clearHighlights(): void {
    const highlighted = container.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    highlighted.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        const textNode = document.createTextNode(el.textContent || '');
        parent.replaceChild(textNode, el);
        // Normalize to merge adjacent text nodes
        parent.normalize();
      }
    });
    matches = [];
    activeIndex = 0;
  }

  /**
   * Highlights all occurrences of the search text
   */
  function highlightMatches(searchText: string): void {
    if (!searchText.trim()) {
      clearHighlights();
      return;
    }

    clearHighlights();
    const searchLower = searchText.toLowerCase();
    const textNodes = getTextNodes(container);

    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      const textLower = text.toLowerCase();

      // Find all matches in this text node
      const matchPositions: { start: number; end: number }[] = [];
      let pos = 0;
      while ((pos = textLower.indexOf(searchLower, pos)) !== -1) {
        matchPositions.push({ start: pos, end: pos + searchText.length });
        pos += searchText.length;
      }

      if (matchPositions.length === 0) continue;

      // Create a document fragment with highlighted spans
      const fragment = document.createDocumentFragment();
      let lastEnd = 0;

      for (const match of matchPositions) {
        // Add text before match
        if (match.start > lastEnd) {
          fragment.appendChild(document.createTextNode(text.slice(lastEnd, match.start)));
        }
        // Add highlighted match
        const span = document.createElement('span');
        span.className = HIGHLIGHT_CLASS;
        span.textContent = text.slice(match.start, match.end);
        fragment.appendChild(span);
        matches.push(span);
        lastEnd = match.end;
      }

      // Add remaining text after last match
      if (lastEnd < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastEnd)));
      }

      // Replace the text node with the fragment
      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    // Set the first match as active
    if (matches.length > 0) {
      activeIndex = 0;
      setActiveMatch(0);
    }
  }

  /**
   * Sets the active match and scrolls it into view
   */
  function setActiveMatch(index: number): void {
    // Remove active class from previous match
    matches.forEach((match) => match.classList.remove(ACTIVE_HIGHLIGHT_CLASS));

    if (matches.length === 0) return;

    // Ensure index is in bounds
    activeIndex = ((index % matches.length) + matches.length) % matches.length;

    // Add active class to current match
    const activeMatch = matches[activeIndex];
    activeMatch.classList.add(ACTIVE_HIGHLIGHT_CLASS);

    // Scroll into view
    activeMatch.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }

  return {
    search(text: string): DOMSearchResult {
      highlightMatches(text);
      return {
        totalMatches: matches.length,
        activeMatchIndex: matches.length > 0 ? activeIndex + 1 : 0, // 1-indexed for display
      };
    },

    findNext(): DOMSearchResult {
      if (matches.length === 0) {
        return { totalMatches: 0, activeMatchIndex: 0 };
      }
      setActiveMatch(activeIndex + 1);
      return {
        totalMatches: matches.length,
        activeMatchIndex: activeIndex + 1, // 1-indexed for display
      };
    },

    findPrevious(): DOMSearchResult {
      if (matches.length === 0) {
        return { totalMatches: 0, activeMatchIndex: 0 };
      }
      setActiveMatch(activeIndex - 1);
      return {
        totalMatches: matches.length,
        activeMatchIndex: activeIndex + 1, // 1-indexed for display
      };
    },

    clear(): void {
      clearHighlights();
    },

    destroy(): void {
      clearHighlights();
      matches = [];
    },
  };
}
