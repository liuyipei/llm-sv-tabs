/**
 * Preload Script
 *
 * Exposes a safe API to the renderer process for capture operations.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type CaptureConfig,
  type CapturedTile,
  type CaptureProgress,
  type CaptureWarning,
  type NavigationState,
  type ExportOptions,
} from '../shared/types.js';

/**
 * API exposed to the renderer process
 */
const captureAPI = {
  // Navigation
  navigate: (url: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.NAVIGATE, url);
  },

  onNavigationState: (callback: (state: NavigationState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: NavigationState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.NAVIGATION_STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NAVIGATION_STATE, handler);
  },

  // Capture
  startCapture: (config: CaptureConfig): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.START_CAPTURE, config);
  },

  stopCapture: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_CAPTURE);
  },

  onCaptureProgress: (callback: (progress: CaptureProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: CaptureProgress) =>
      callback(progress);
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_PROGRESS, handler);
  },

  onCaptureTile: (callback: (tile: CapturedTile) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tile: CapturedTile) => callback(tile);
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_TILE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_TILE, handler);
  },

  onCaptureWarning: (callback: (warning: CaptureWarning) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, warning: CaptureWarning) =>
      callback(warning);
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_WARNING, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_WARNING, handler);
  },

  onCaptureComplete: (callback: (tiles: CapturedTile[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tiles: CapturedTile[]) => callback(tiles);
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_COMPLETE, handler);
  },

  onCaptureError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.CAPTURE_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CAPTURE_ERROR, handler);
  },

  // Export
  exportTiles: (
    tiles: CapturedTile[],
    options: ExportOptions
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EXPORT_TILES, tiles, options);
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('captureAPI', captureAPI);

// TypeScript type for the exposed API
export type CaptureAPI = typeof captureAPI;
