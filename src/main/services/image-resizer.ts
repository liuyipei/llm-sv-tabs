import { nativeImage } from 'electron';

/**
 * Image Resizing Service
 *
 * Resizes images to fit within a maximum dimension while preserving aspect ratio.
 * Uses Electron's nativeImage API for efficient image processing.
 */
export class ImageResizer {
  /**
   * Resize an image if it exceeds the maximum dimension on either side
   *
   * @param imageDataUrl - Base64 data URL of the image (e.g., "data:image/png;base64,...")
   * @param maxDimension - Maximum width or height in pixels (default: 512)
   * @returns Resized image as base64 data URL, or original if already small enough
   */
  static resizeImage(imageDataUrl: string, maxDimension: number = 512): string {
    try {
      // Create native image from data URL
      const image = nativeImage.createFromDataURL(imageDataUrl);

      if (image.isEmpty()) {
        console.error('Failed to create image from data URL');
        return imageDataUrl;
      }

      const size = image.getSize();
      const { width, height } = size;

      // Check if resizing is needed
      if (width <= maxDimension && height <= maxDimension) {
        // Image is already small enough
        return imageDataUrl;
      }

      // Calculate new dimensions while preserving aspect ratio
      let newWidth: number;
      let newHeight: number;

      if (width > height) {
        // Width is the longer dimension
        newWidth = maxDimension;
        newHeight = Math.round((height / width) * maxDimension);
      } else {
        // Height is the longer dimension (or equal)
        newHeight = maxDimension;
        newWidth = Math.round((width / height) * maxDimension);
      }

      // Resize the image
      const resized = image.resize({
        width: newWidth,
        height: newHeight,
        quality: 'good', // 'good' is a balanced quality setting
      });

      // Convert back to data URL
      // Use PNG to preserve quality, or JPEG for smaller size
      const isPng = imageDataUrl.includes('image/png');
      const resizedDataUrl = isPng
        ? resized.toPNG().toString('base64')
        : resized.toJPEG(85).toString('base64'); // 85% quality for JPEG

      // Determine MIME type from original
      const mimeMatch = imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

      return `data:${mimeType};base64,${resizedDataUrl}`;
    } catch (error) {
      console.error('Error resizing image:', error);
      return imageDataUrl; // Return original on error
    }
  }

  /**
   * Extract base64 data and MIME type from a data URL
   *
   * @param dataUrl - Data URL (e.g., "data:image/png;base64,...")
   * @returns Object with mimeType and base64 data (without prefix)
   */
  static parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);

    if (!match) {
      throw new Error('Invalid data URL format');
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  /**
   * Get image dimensions from a data URL
   *
   * @param imageDataUrl - Base64 data URL of the image
   * @returns Object with width and height, or null if invalid
   */
  static getImageSize(imageDataUrl: string): { width: number; height: number } | null {
    try {
      const image = nativeImage.createFromDataURL(imageDataUrl);

      if (image.isEmpty()) {
        return null;
      }

      return image.getSize();
    } catch (error) {
      console.error('Error getting image size:', error);
      return null;
    }
  }
}
