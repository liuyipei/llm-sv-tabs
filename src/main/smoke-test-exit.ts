import type { App } from 'electron';
import type { ShutdownManager } from './services/shutdown-manager.js';

export interface SmokeTestExitControls {
  handleWindowLoaded: () => void;
}

export function initSmokeTestExit(app: App, shutdownManager: ShutdownManager): SmokeTestExitControls {
  // Force exit function that works reliably on Windows
  const forceExit = (exitCode: number) => {
    // On Windows, process.exit() inside event handlers may not work immediately
    // Use setImmediate to escape the event handler context, then exit
    setImmediate(() => {
      process.exit(exitCode);
    });
  };

  app.on('window-all-closed', () => {
    console.log('Smoke test: window-all-closed, quitting');
    app.quit();
  });

  app.once('will-quit', () => {
    console.log('Smoke test: will-quit, forcing immediate exit');
    forceExit(0);
  });

  return {
    handleWindowLoaded: () => {
      console.log('Smoke test passed: window loaded successfully');
      shutdownManager.performCleanup();
      // Force exit immediately after cleanup - don't wait for quit events
      forceExit(0);
    },
  };
}
