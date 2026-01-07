/**
 * PDF Converter Service
 *
 * Uses pdf.js to convert PDF pages to images.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - use unpkg to match the installed package version
// @ts-expect-error - version exists on pdfjsLib
const version = pdfjsLib.version || '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

export interface PdfPage {
  pageNumber: number;
  width: number;
  height: number;
  imageDataUrl: string;
}

export interface PdfConversionResult {
  pages: PdfPage[];
  pageCount: number;
  duration: number;
}

export interface PdfConversionOptions {
  dpi?: number;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number; // 0-1 for jpeg/webp
}

/**
 * Convert a PDF file to images
 */
export async function convertPdfToImages(
  file: File | ArrayBuffer,
  options: PdfConversionOptions = {}
): Promise<PdfConversionResult> {
  const startTime = Date.now();
  const { dpi = 150, format = 'png', quality = 0.92 } = options;

  // Scale factor: 72 DPI is the default PDF unit, so we scale relative to that
  const scale = dpi / 72;

  // Load the PDF
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: PdfPage[] = [];

  // Render each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render the page
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    // Convert to data URL
    const mimeType = format === 'png' ? 'image/png' :
                     format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const imageDataUrl = format === 'png'
      ? canvas.toDataURL(mimeType)
      : canvas.toDataURL(mimeType, quality);

    pages.push({
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      imageDataUrl,
    });
  }

  return {
    pages,
    pageCount: pdf.numPages,
    duration: Date.now() - startTime,
  };
}

/**
 * Extract text from a PDF using the built-in text layer
 */
export async function extractPdfText(
  file: File | ArrayBuffer
): Promise<{ text: string; pages: string[]; duration: number }> {
  const startTime = Date.now();

  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Join text items with appropriate spacing
    const pageText = textContent.items
      .map((item: { str?: string }) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pageTexts.push(pageText);
  }

  return {
    text: pageTexts.join('\n\n'),
    pages: pageTexts,
    duration: Date.now() - startTime,
  };
}
