import { BrowserView } from 'electron';
import type { ExtractedContent, SerializedDOM, TabData } from '../../types';
import { ImageResizer } from './image-resizer.js';

/**
 * Content Extraction Service
 *
 * Extracts content from tabs for LLM context:
 * - DOM serialization (headings, paragraphs, links)
 * - Screenshots for vision models
 * - Images from uploaded image tabs
 */
export class ContentExtractor {
  /**
   * Extract content from a tab's BrowserView
   */
  static async extractFromTab(
    view: BrowserView,
    _tabId: string,
    includeScreenshot = false
  ): Promise<ExtractedContent> {
    const url = view.webContents.getURL();
    const title = view.webContents.getTitle();

    // Execute DOM serialization in the page context
    const serializedDOM = await this.serializeDOM(view);

    // Capture screenshot if requested
    let screenshot: string | undefined;
    if (includeScreenshot) {
      screenshot = await this.captureScreenshot(view);
    }

    return {
      type: 'html',
      title: title || 'Untitled',
      url,
      content: serializedDOM,
      screenshot,
    };
  }

  /**
   * Serialize DOM content from the page
   */
  private static async serializeDOM(view: BrowserView): Promise<SerializedDOM> {
    const result = await view.webContents.executeJavaScript(`
      (function() {
        // Extract headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(h => h.textContent?.trim())
          .filter(Boolean);

        // Extract paragraphs
        const paragraphs = Array.from(document.querySelectorAll('p'))
          .map(p => p.textContent?.trim())
          .filter(text => text && text.length > 20)
          .slice(0, 50); // Limit to first 50 paragraphs

        // Extract links
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({
            text: a.textContent?.trim() || '',
            href: a.getAttribute('href') || ''
          }))
          .filter(link => link.text && link.href)
          .slice(0, 100); // Limit to first 100 links

        // Extract main content (try to find main content area)
        let mainContent = '';
        const mainElement = document.querySelector('main, article, [role="main"]');
        if (mainElement) {
          mainContent = mainElement.textContent?.trim() || '';
        } else {
          mainContent = document.body.textContent?.trim() || '';
        }
        // Truncate to reasonable length
        if (mainContent.length > 50000) {
          mainContent = mainContent.substring(0, 50000) + '...';
        }

        // Extract meta tags
        const metaTags = {};
        document.querySelectorAll('meta[name], meta[property]').forEach(meta => {
          const key = meta.getAttribute('name') || meta.getAttribute('property');
          const value = meta.getAttribute('content');
          if (key && value) {
            metaTags[key] = value;
          }
        });

        return {
          title: document.title,
          url: window.location.href,
          headings,
          paragraphs,
          links,
          mainContent,
          metaTags
        };
      })();
    `);

    return result;
  }

  /**
   * Capture screenshot of the current view
   */
  private static async captureScreenshot(view: BrowserView): Promise<string> {
    const image = await view.webContents.capturePage();
    return image.toDataURL();
  }

  /**
   * Extract content from a note tab (especially image tabs)
   */
  static async extractFromNoteTab(tabData: TabData): Promise<ExtractedContent> {
    // Check if this is an image tab
    if (tabData.metadata?.fileType === 'image' && tabData.metadata?.imageData) {
      const imageDataUrl = tabData.metadata.imageData;
      const mimeType = tabData.metadata.mimeType || 'image/png';

      // Resize image if needed (max 512px on long side)
      const resizedDataUrl = ImageResizer.resizeImage(imageDataUrl, 512);

      return {
        type: 'image',
        title: tabData.title,
        url: tabData.url,
        content: '', // No text content for pure image tabs
        imageData: {
          data: resizedDataUrl,
          mimeType: mimeType,
        },
      };
    }

    // For non-image note tabs, return text content
    // The content would be stored in the note's body (via metadata or needs to be passed)
    return {
      type: 'text',
      title: tabData.title,
      url: tabData.url,
      content: tabData.metadata?.response || '', // For LLM response tabs
    };
  }
}
