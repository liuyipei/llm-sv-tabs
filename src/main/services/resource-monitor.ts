/**
 * Runtime resource leak detection for development
 *
 * Tracks active resources and logs warnings when counts grow unexpectedly.
 * Enable in development by setting environment variable: RESOURCE_MONITOR=1
 */

import { webContents } from 'electron';

export interface ResourceSnapshot {
  timestamp: number;
  tabs: number;
  webContents: number;
  abortControllers: number;
  tempFiles: number;
}

export class ResourceMonitor {
  private enabled: boolean;
  private snapshots: ResourceSnapshot[] = [];
  private readonly MAX_SNAPSHOTS = 100;
  private monitorInterval?: NodeJS.Timeout;

  constructor() {
    this.enabled = process.env.RESOURCE_MONITOR === '1' || process.env.NODE_ENV === 'development';
  }

  /**
   * Start monitoring resources every 30 seconds
   */
  start(getResourceCounts: () => Omit<ResourceSnapshot, 'timestamp'>): void {
    if (!this.enabled) return;

    console.log('🔍 Resource monitor started (development mode)');

    this.monitorInterval = setInterval(() => {
      const snapshot: ResourceSnapshot = {
        timestamp: Date.now(),
        ...getResourceCounts(),
      };

      this.snapshots.push(snapshot);

      // Keep only recent snapshots
      if (this.snapshots.length > this.MAX_SNAPSHOTS) {
        this.snapshots.shift();
      }

      this.checkForLeaks(snapshot);
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  /**
   * Get current resource counts
   */
  getSnapshot(getResourceCounts: () => Omit<ResourceSnapshot, 'timestamp'>): ResourceSnapshot {
    return {
      timestamp: Date.now(),
      ...getResourceCounts(),
    };
  }

  /**
   * Log current resource status
   */
  logStatus(snapshot: ResourceSnapshot): void {
    if (!this.enabled) return;

    console.log('📊 Resource Status:', {
      tabs: snapshot.tabs,
      webContents: snapshot.webContents,
      abortControllers: snapshot.abortControllers,
      tempFiles: snapshot.tempFiles,
    });
  }

  /**
   * Check for potential leaks
   */
  private checkForLeaks(current: ResourceSnapshot): void {
    if (this.snapshots.length < 3) return; // Need history

    const recent = this.snapshots.slice(-10); // Last 10 snapshots
    const baseline = recent[0];

    // Check for monotonic growth (always increasing)
    const webContentsGrowth = current.webContents - baseline.webContents;
    const tabGrowth = current.tabs - baseline.tabs;

    // Warn if WebContents count is significantly higher than tab count
    if (current.webContents > current.tabs * 1.5) {
      console.warn('⚠️  Potential WebContents leak detected:', {
        tabs: current.tabs,
        webContents: current.webContents,
        ratio: (current.webContents / current.tabs).toFixed(2),
        expected: '~1.0',
      });
    }

    // Warn if AbortControllers are accumulating
    if (current.abortControllers > 10) {
      console.warn('⚠️  Potential AbortController leak detected:', {
        abortControllers: current.abortControllers,
        tabs: current.tabs,
        hint: 'Are streams being properly cleaned up in finally blocks?',
      });
    }

    // Warn if temp files are accumulating
    if (current.tempFiles > current.tabs * 2) {
      console.warn('⚠️  Potential temp file leak detected:', {
        tempFiles: current.tempFiles,
        tabs: current.tabs,
        hint: 'Are temp files being cleaned up on tab close?',
      });
    }

    // Detect steady growth over time
    if (recent.length >= 5) {
      const isGrowing = recent.every((s, i) =>
        i === 0 || s.webContents >= recent[i - 1].webContents
      );

      if (isGrowing && webContentsGrowth > 10) {
        console.warn('⚠️  Steady resource growth detected:', {
          webContentsGrowth,
          tabGrowth,
          duration: `${recent.length * 30}s`,
          hint: 'Resources may not be getting cleaned up properly',
        });
      }
    }
  }

  /**
   * Force garbage collection (if available) and log before/after
   */
  async forceGCAndLog(getResourceCounts: () => Omit<ResourceSnapshot, 'timestamp'>): Promise<void> {
    if (!this.enabled) return;

    const before = this.getSnapshot(getResourceCounts);
    console.log('🗑️  Before GC:', before);

    if (global.gc) {
      global.gc();
      // Wait a bit for GC to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const after = this.getSnapshot(getResourceCounts);
      console.log('✅ After GC:', after);

      const freed = {
        webContents: before.webContents - after.webContents,
        tabs: before.tabs - after.tabs,
      };

      if (freed.webContents > 0 || freed.tabs > 0) {
        console.log('♻️  Freed:', freed);
      } else {
        console.log('ℹ️  No resources freed (may indicate leaks or all in use)');
      }
    } else {
      console.log('ℹ️  GC not available. Run with --expose-gc flag for GC testing');
    }
  }
}

/**
 * Get current WebContents count (including destroyed)
 */
export function getWebContentsCount(): number {
  return webContents.getAllWebContents().filter(wc => !wc.isDestroyed()).length;
}
