import { WebContentsView } from 'electron';
import type { ExtractedContent, SerializedDOM, TabData } from '../../types';
import { ImageResizer } from './image-resizer.js';
import { SmartContentExtractor } from './smart-content-extractor.js';
import { extractPdfContent } from './pdf-extractor.js';

/**
 * Content Extraction Service
 *
 * Extracts content from tabs for LLM context:
 * - Smart DOM extraction (article vs app routing, Markdown/HTML output)
 * - Legacy DOM serialization (headings, paragraphs, links)
 * - Screenshots for vision models
 * - Images from uploaded image tabs
 */
export class ContentExtractor {
  /**
   * Extract content from a tab's WebContentsView using smart extraction
   *
   * Uses SmartContentExtractor to intelligently process pages:
   * - Articles (blogs, news) → Markdown via Readability
   * - Apps (SPAs, dashboards) → Simplified semantic HTML
   *
   * This is the recommended extraction method.
   */
  static async extractFromTab(
    view: WebContentsView,
    _tabId: string,
    includeScreenshot = false
  ): Promise<ExtractedContent> {
    const url = view.webContents.getURL();

    // Use smart extraction
    const smartContent = await SmartContentExtractor.extract(view);

    // Capture screenshot if requested
    let screenshot: string | undefined;
    if (includeScreenshot) {
      screenshot = await this.captureScreenshot(view);
    }

    return {
      type: 'html',
      title: smartContent.title,
      url,
      content: smartContent.content, // Already formatted as Markdown or HTML
      screenshot,
      metadata: {
        extractionType: smartContent.type,
        tokenEstimate: smartContent.tokenEstimate,
      },
    };
  }

  /**
   * Extract content using legacy DOM serialization
   *
   * @deprecated Use extractFromTab() which uses SmartContentExtractor
   */
  static async extractFromTabLegacy(
    view: WebContentsView,
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
  private static async serializeDOM(view: WebContentsView): Promise<SerializedDOM> {
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
  private static async captureScreenshot(view: WebContentsView): Promise<string> {
    const image = await view.webContents.capturePage();
    return image.toDataURL();
  }

  /**
   * Extract content from a note tab (especially image tabs)
   */
  static async extractFromNoteTab(tabData: TabData): Promise<ExtractedContent> {
    const isLLMResponseTab = tabData.component === 'llm-response' || tabData.metadata?.isLLMResponse;

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

    // Check if this is a PDF tab
    if (tabData.metadata?.fileType === 'pdf' && tabData.metadata?.filePath) {
      try {
        const pdfContent = await extractPdfContent(tabData.metadata.filePath);

        // Concatenate all page texts
        const fullText = pdfContent.textPages
          .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
          .join('\n\n');

        // Collect all page images for vision models
        const pdfPageImages = pdfContent.images.map((img) => ({
          pageNumber: img.pageNumber,
          data: img.dataUrl,
          mimeType: 'image/png',
        }));

        return {
          type: 'pdf',
          title: tabData.title,
          url: tabData.url,
          content: fullText,
          metadata: {
            pageCount: pdfContent.textPages.length,
            pdfPageImages, // Array of page images for vision models
            extractionTimeMs: pdfContent.totalExtractionTimeMs,
          },
        };
      } catch (error) {
        console.error('Failed to extract PDF content:', error);
        return {
          type: 'pdf',
          title: tabData.title,
          url: tabData.url,
          content: `[PDF extraction failed: ${error instanceof Error ? error.message : String(error)}]`,
        };
      }
    }

    // For non-image note tabs, return text content
    const noteContent =
      tabData.metadata?.fileType === 'text'
        ? tabData.metadata?.noteContent || ''
        : tabData.metadata?.noteContent;

    return {
      type: 'text',
      title: tabData.title,
      url: tabData.url,
      content: isLLMResponseTab ? tabData.metadata?.response || '' : noteContent || '',
    };
  }
}
