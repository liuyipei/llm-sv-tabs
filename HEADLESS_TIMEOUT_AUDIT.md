# Headless Mode & Timeout Audit Report

## Executive Summary

This audit examined all timeout configurations and defensive programming related to headless mode across Linux, macOS, and Windows. The codebase has **multiple overlapping timeout layers** that create redundancy but also potential confusion.

## Current Timeout Architecture

### 1. **scripts/start-headless.js** (Process-level wrapper)
- **Timeout**: 20 seconds (`SMOKE_TEST_TIMEOUT_MS = 20000`)
- **Scope**: Entire Electron process
- **Action**: `SIGKILL` if process doesn't exit within 20s
- **OS Coverage**: All three platforms (Linux, macOS, Windows)
- **Purpose**: Last-resort failsafe to prevent hanging CI jobs

**OS-Specific Handling**:
- **Linux**: Uses `xvfb-run` for virtual framebuffer if available, falls back to `--enable-features=UseOzonePlatform --ozone-platform=headless`
- **macOS/Windows**: Uses offscreen rendering with `--disable-gpu`, `--disable-software-rasterizer`, `--disable-dev-shm-usage`, `--no-sandbox`

### 2. **src/main/smoke-test-exit.ts** (App-level orchestration)
- **Force Exit Timer**: 5 seconds (`SMOKE_TEST_FORCE_EXIT_MS = 5000`)
  - Unreferenced timer (won't prevent exit)
  - Logs error if triggered: "Smoke test: forcing process exit after timeout"
- **Success Exit Delay**: 2 seconds after window loads
  - Gives time for cleanup before exit
  - Uses `setTimeout(() => process.exit(0), 2000).unref()`

**Event Flow**:
1. Window loads → `handleWindowLoaded()` called
2. Cleanup performed
3. `app.quit()` called
4. Wait 2s, then `process.exit(0)`

### 3. **src/main/services/shutdown-manager.ts** (Cleanup orchestration)
- **Force Exit Delay**: 500ms in `will-quit` handler
- **Purpose**: Ensures no zombie processes on Windows
- **Cleanup Flow**:
  1. `before-quit` → Run cleanup callbacks + destroy all windows
  2. `will-quit` → Force exit after 500ms grace period

### 4. **GitHub Actions Workflow Timeouts**
- **Ubuntu test job**: 5 minutes (`timeout-minutes: 5`)
- **Lint job**: 3 minutes (`timeout-minutes: 3`)
- **Build-smoke job**: 10 minutes (`timeout-minutes: 10`)
- **macOS build**: No explicit timeout (defaults to 360 minutes)
- **Windows build**: No explicit timeout (defaults to 360 minutes)

### 5. **Probe Client Timeouts** (LLM API calls)
- **HTTP Request Timeout**: 15 seconds (`DEFAULT_PROBE_CONFIG.timeoutMs = 15000`)
- **Max Retries**: 2
- **Retry Delay**: 500ms
- **Purpose**: Prevent hanging on unresponsive LLM endpoints

## Analysis by Operating System

### Linux (Ubuntu in CI)
✅ **Well Supported**
- Primary development/test platform
- xvfb-run provides reliable virtual framebuffer
- Fallback to Ozone headless platform if xvfb unavailable
- Explicit `--no-sandbox` for CI environments

**Timeout Stack** (fastest to slowest):
1. 500ms: Shutdown manager force exit
2. 2s: Smoke test success exit
3. 5s: Smoke test force exit timer (unreferenced)
4. 20s: start-headless.js SIGKILL
5. 5 min: GitHub Actions job timeout (test)
6. 10 min: GitHub Actions job timeout (build-smoke)

### macOS
✅ **Supported**
- Offscreen rendering via Electron flags
- No xvfb dependency
- Same timeout stack as Linux
- Runs smoke test in CI (build-macos.yml:36)
- No job-level timeout (relies on GitHub default: 360 min)

**Potential Issue**: No job timeout means runaway processes could waste CI credits.

### Windows
✅ **Supported**
- Offscreen rendering via Electron flags
- Shell mode enabled for spawning `.cmd` files (start-headless.js:69)
- Extra defensive code for zombie processes (shutdown-manager.ts:115)
- Runs smoke test in CI (build-windows.yml:36)
- No job-level timeout (relies on GitHub default: 360 min)

**Potential Issue**: Same as macOS - no job timeout.

## Issues & Concerns

### ❌ **CRITICAL**: The Original Bug (FIXED)
The preload script ES6 import issue was causing:
- Preload failure → undefined `window.electronAPI`
- App falls back to mock API
- Smoke test never completes → hits 20s timeout
- **Status**: Fixed by bundling preload scripts to CommonJS

### ⚠️ **HIGH**: Overlapping Timeouts Create Confusion
Multiple timeout layers with different values:
- 500ms (shutdown manager)
- 2s (smoke test success)
- 5s (smoke test force exit - unreferenced)
- 20s (start-headless.js wrapper)

**Problem**: Hard to reason about which timeout will trigger first in edge cases.

### ⚠️ **MEDIUM**: Missing Job Timeouts on macOS/Windows Builds
GitHub Actions jobs for macOS and Windows builds lack explicit timeouts.
- **Risk**: Hanging builds could run for 6 hours (default GitHub timeout)
- **Impact**: Wastes CI credits, delays feedback
- **Recommendation**: Add `timeout-minutes: 10` like Linux build-smoke job

### ⚠️ **MEDIUM**: Unreferenced 5s Timer in smoke-test-exit.ts
The force exit timer is `unref()`'d, meaning it won't keep the process alive:
```typescript
const forceExitTimer = setTimeout(..., 5000);
forceExitTimer.unref?.();
```
- **Current Behavior**: Timer won't prevent normal exit, only logs error if still running
- **Question**: Is this intentional? If so, the timeout is effectively useless as a failsafe.

### ⚠️ **LOW**: macOS Window Behavior Inconsistency
Shutdown manager only quits on `window-all-closed` for non-macOS:
```typescript
if (process.platform !== 'darwin') {
  app.quit();
}
```
- **Standard macOS behavior**: Apps stay running when last window closes
- **In headless mode**: This distinction doesn't matter (no user interaction)
- **Recommendation**: Consider forcing quit on all platforms in smoke test mode

### ⚠️ **LOW**: 20s Timeout May Be Too Long
With the preload bug fixed, normal smoke test should complete in ~5-10s.
- **Current**: 20s timeout
- **Recommendation**: Consider reducing to 15s to catch issues faster

## Recommendations

### Priority 1: Essential Fixes

1. **✅ COMPLETED**: Bundle preload scripts to CommonJS (already done)

2. **Add job timeouts to macOS/Windows workflows**:
   ```yaml
   # .github/workflows/build-macos.yml
   jobs:
     build-macos:
       runs-on: macos-latest
       timeout-minutes: 10  # ADD THIS
   ```
   ```yaml
   # .github/workflows/build-windows.yml
   jobs:
     build-windows:
       runs-on: windows-latest
       timeout-minutes: 10  # ADD THIS
   ```

### Priority 2: Cleanup & Optimization

3. **Consolidate timeout values** - Define constants in one place:
   ```typescript
   // timeout-constants.ts
   export const TIMEOUTS = {
     SHUTDOWN_GRACE_PERIOD_MS: 500,
     SMOKE_TEST_SUCCESS_DELAY_MS: 2000,
     SMOKE_TEST_PROCESS_TIMEOUT_MS: 20000,
   } as const;
   ```

4. **Clarify the unreferenced 5s timer** - Either:
   - Remove it if redundant (recommended)
   - Make it referenced if it should be a failsafe
   - Document why it's unreferenced

5. **Reduce start-headless.js timeout** from 20s → 15s:
   ```javascript
   const SMOKE_TEST_TIMEOUT_MS = 15000;
   ```

6. **Force quit on all platforms in smoke test mode**:
   ```typescript
   // In smoke-test-exit.ts or main.ts
   if (isSmokeTest) {
     app.on('window-all-closed', () => {
       app.quit(); // Don't check platform in smoke test mode
     });
   }
   ```

### Priority 3: Observability

7. **Add timing metrics** to smoke test output:
   ```typescript
   const startTime = Date.now();
   // ... smoke test runs ...
   console.log(`Smoke test completed in ${Date.now() - startTime}ms`);
   ```

8. **Log which timeout triggered** for debugging:
   ```javascript
   console.log('[TIMEOUT] start-headless.js 20s timeout triggered - forcing shutdown');
   ```

## Timeout Decision Matrix

| Scenario | Expected Behavior | Timeout That Should Trigger |
|----------|-------------------|----------------------------|
| ✅ Normal success | Window loads, cleanup, exit | 2s success delay |
| ❌ Preload failure | Falls back to mock, hangs | 20s process timeout |
| ❌ Renderer crash | No window load event | 20s process timeout |
| ❌ Cleanup hangs | After window load | 500ms shutdown force exit |
| ❌ App.quit() hangs | Process won't exit | 500ms shutdown force exit |

## Testing Recommendations

After implementing changes, test on all three platforms:

**Linux**:
```bash
npm run test:smoke  # Should complete in ~5-10s
```

**macOS**:
```bash
npm run test:smoke  # Should complete in ~5-10s
```

**Windows** (PowerShell):
```powershell
npm run test:smoke  # Should complete in ~5-10s
```

**Failure scenarios to test**:
1. Comment out preload bundling → should timeout at 15s (or 20s currently)
2. Add infinite loop in cleanup → should force exit at 500ms
3. Disable Electron → should fail gracefully with clear error

## Conclusion

The timeout architecture is **functional but overly complex**. The immediate preload bundling fix resolves the primary issue. Additional recommendations focus on:
1. **Reliability**: Add job timeouts to prevent runaway CI jobs
2. **Clarity**: Consolidate timeout values and document intent
3. **Efficiency**: Reduce timeout values now that the root cause is fixed

**Estimated Risk Level**:
- ✅ **Pre-fix**: HIGH (smoke tests failing intermittently)
- ✅ **Post-fix**: LOW (redundant timeouts provide safety net)
