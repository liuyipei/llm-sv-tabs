import { contextBridge, ipcRenderer } from 'electron';
import type { Rectangle } from '../types';

/**
 * Preload script for the screenshot overlay window.
 * 
 * This preload script exposes a minimal API to the overlay renderer process,
 * allowing it to communicate with the main screenshot service via IPC.
 * 
 * Security note:
 * - nodeIntegration: false (enforced)
 * - contextIsolation: true (enforced)
 * - sandbox: true (enforced)
 */

const screenshotOverlayAPI = {
  /**
   * Send the selected region bounds to the main process
   */
  selectRegion: (bounds: Rectangle) => {
    ipcRenderer.send('screenshot-region-selected', bounds);
  },

  /**
   * Cancel the screenshot capture
   */
  cancel: () => {
    ipcRenderer.send('screenshot-cancelled');
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('screenshotOverlay', screenshotOverlayAPI);

console.log('Screenshot overlay preload script loaded');
