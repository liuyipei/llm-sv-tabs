import type { CaptureAPI } from '../main/preload';

declare global {
  interface Window {
    captureAPI: CaptureAPI;
  }
}

export {};
