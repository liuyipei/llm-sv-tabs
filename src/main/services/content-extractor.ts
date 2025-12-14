import { BrowserWindow, WebContentsView } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  ExtractedContent,
  ImageDataPayload,
  PDFContent,
  SerializedDOM,
  TabData,
} from '../../types';
import { ImageResizer } from './image-resizer.js';
import { SmartContentExtractor } from './smart-content-extractor.js';

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
    const bounds = (view as any).getBounds?.();
    const image = bounds
      ? await view.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height })
      : await view.webContents.capturePage();
    return image.toDataURL();
  }

  /**
   * Extract content from a note tab (especially image and PDF tabs)
   */
  static async extractFromNoteTab(
    tabData: TabData,
    view?: WebContentsView
  ): Promise<ExtractedContent> {
    // Check if this is a PDF tab
    if (tabData.metadata?.fileType === 'pdf') {
      const pdfPath = this.resolvePdfPath(tabData);

      // Try to extract searchable text from the PDF (from live view first, then fallback to file)
      const pdfContent =
        (await this.extractPdfTextFromWebContents(view)) ||
        (pdfPath ? await this.extractPdfTextFromFile(pdfPath) : undefined);

      // Capture viewport-sized previews for vision models when a view is available (multi-page aware)
      const previews = view ? await this.capturePdfPagePreviews(view) : [];
      const primaryPreview = previews[0];
      const additionalPreviews = previews.slice(1);

      return {
        type: 'pdf',
        title: tabData.title,
        url: tabData.url,
        content: pdfContent ?? '',
        imageData: primaryPreview,
        images: additionalPreviews.length > 0 ? additionalPreviews : undefined,
        metadata:
          pdfContent && typeof pdfContent === 'object'
            ? { numPages: pdfContent.numPages, previewPages: previews.map(p => p.page).filter(Boolean) }
            : previews.length > 0
              ? { previewPages: previews.map(p => p.page).filter(Boolean) }
              : undefined,
      };
    }

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

  /**
   * Attempt to extract text from a PDF loaded in a WebContentsView.
   */
  private static async extractPdfTextFromWebContents(view?: WebContentsView): Promise<PDFContent | undefined> {
    if (!view) return undefined;

    try {
      await this.waitForPdfTextLayer(view);

      const pdfContent = await view.webContents.executeJavaScript(`
        (() => {
          try {
            const textLayers = Array.from(document.querySelectorAll('.textLayer'));
            if (textLayers.length === 0) return null;

            const pages = textLayers
              .map(layer => {
                try {
                  return Array.from(layer.querySelectorAll('span'))
                    .map(span => span.textContent || '')
                    .join('')
                    .trim();
                } catch (e) {
                  console.error('Error extracting text from layer:', e);
                  return '';
                }
              })
              .filter(Boolean);

            return {
              text: pages.join('\\n\\n'),
              numPages: pages.length,
            };
          } catch (error) {
            console.error('PDF text extraction error:', error);
            return { error: error.message || String(error) };
          }
        })();
      `);

      // Check if extraction returned an error
      if (pdfContent && 'error' in pdfContent) {
        console.warn('PDF text extraction failed in renderer:', pdfContent.error);
        return undefined;
      }

      if (pdfContent) {
        const totalPages = await this.getPdfPageCount(view);
        if (totalPages && totalPages > pdfContent.numPages) {
          pdfContent.numPages = totalPages;
        }
      }

      return pdfContent || undefined;
    } catch (error) {
      console.warn('Failed to extract PDF text from view:', error);
      return undefined;
    }
  }

  /**
   * Load a PDF offscreen and extract text via its rendered text layer.
   */
  private static async extractPdfTextFromFile(filePath: string): Promise<PDFContent | undefined> {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
      },
    });

    try {
      await window.webContents.loadURL(pathToFileURL(filePath).toString());

      await this.waitForPdfTextLayer(window as unknown as WebContentsView);

      return await this.extractPdfTextFromWebContents(window as unknown as WebContentsView);
    } catch (error) {
      console.warn('Failed to extract PDF text from file:', error);
      return undefined;
    } finally {
      window.destroy();
    }
  }

  private static resolvePdfPath(tabData: TabData): string | undefined {
    if (tabData.metadata?.filePath) return tabData.metadata.filePath;

    try {
      if (tabData.url?.startsWith('file://')) {
        return fileURLToPath(tabData.url);
      }
    } catch (error) {
      console.warn('Failed to resolve PDF path from URL:', error);
    }

    return undefined;
  }

  private static async waitForPdfTextLayer(view: WebContentsView): Promise<void> {
    try {
      await view.webContents.executeJavaScript(`
        new Promise(resolve => {
          let attempts = 0;
          const maxAttempts = 12;
          const waitForText = () => {
            const hasText = document.querySelector('.textLayer');
            if (hasText || attempts >= maxAttempts) {
              resolve(true);
              return;
            }
            attempts += 1;
            setTimeout(waitForText, 150);
          };
          waitForText();
        });
      `);
    } catch {
      // Swallow wait errors and allow extraction to continue with best-effort data
    }
  }

  private static async getPdfPageCount(view: WebContentsView): Promise<number | undefined> {
    try {
      return await view.webContents.executeJavaScript(`
        (() => {
          const app = (window as any).PDFViewerApplication;
          return app?.pdfDocument?.numPages || undefined;
        })();
      `);
    } catch {
      return undefined;
    }
  }

  private static async capturePdfPagePreviews(view: WebContentsView, maxPages = 3): Promise<ImageDataPayload[]> {
    const bounds = (view as any).getBounds?.();
    const captureBounds = bounds ? { x: 0, y: 0, width: bounds.width, height: bounds.height } : undefined;

    await this.waitForPdfTextLayer(view);
    const numPages = await this.getPdfPageCount(view);
    const pagesToCapture = Math.min(numPages ?? maxPages, maxPages);

    const previews: ImageDataPayload[] = [];
    if (pagesToCapture === 0) return previews;

    for (let page = 1; page <= pagesToCapture; page += 1) {
      // Navigate to the page in the PDF viewer so the viewport shows the target page
      await view.webContents.executeJavaScript(`
        (() => {
          const app = (window as any).PDFViewerApplication;
          if (app && app.page !== undefined) {
            app.page = ${page};
          }
        })();
      `);

      // Give the viewer a short moment to render the requested page
      await new Promise(resolve => setTimeout(resolve, 120));

      const image = captureBounds
        ? await view.webContents.capturePage(captureBounds)
        : await view.webContents.capturePage();
      const resized = ImageResizer.resizeImage(image.toDataURL(), 1568);
      previews.push({ data: resized, mimeType: 'image/png', page });
    }

    return previews;
  }
}
