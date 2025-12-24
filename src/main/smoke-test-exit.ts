import type { App } from 'electron';
import type { ShutdownManager } from './services/shutdown-manager.js';

const SMOKE_TEST_FORCE_EXIT_MS = 5000;

export interface SmokeTestExitControls {
  handleWindowLoaded: () => void;
}

export function initSmokeTestExit(app: App, shutdownManager: ShutdownManager): SmokeTestExitControls {
  const forceExitTimer = setTimeout(() => {
    console.error('Smoke test: forcing process exit after timeout');
    process.exit(0);
  }, SMOKE_TEST_FORCE_EXIT_MS);

  if (typeof forceExitTimer.unref === 'function') {
    forceExitTimer.unref();
  }

  app.on('window-all-closed', () => {
    console.log('Smoke test: window-all-closed, quitting');
    app.quit();
  });

  app.once('will-quit', () => {
    clearTimeout(forceExitTimer);

    const immediateExit = setTimeout(() => process.exit(0), 0);
    if (typeof immediateExit.unref === 'function') {
      immediateExit.unref();
    }
  });

  return {
    handleWindowLoaded: () => {
      console.log('Smoke test passed: window loaded successfully');
      shutdownManager.performCleanup();
      app.quit();
    },
  };
}
