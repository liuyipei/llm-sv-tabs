#!/usr/bin/env node
/**
 * Cross-platform headless Electron launcher
 * - Linux: Uses xvfb-run for virtual framebuffer
 * - macOS/Windows: Uses offscreen rendering
 *
 * Usage:
 *   node scripts/start-headless.js [--smoke-test]
 *
 * Options:
 *   --smoke-test  Exit after window loads (for CI verification)
 */

import { spawn, execSync } from 'child_process';
import { platform } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const os = platform();
const isWindows = os === 'win32';

// Pass through arguments like --smoke-test
const appArgs = process.argv.slice(2);

// On Windows, npm bin stubs use .cmd extension
const electronBin = isWindows ? 'electron.cmd' : 'electron';
const electronPath = join(projectRoot, 'node_modules', '.bin', electronBin);

function hasXvfb() {
  try {
    execSync('which xvfb-run', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runElectron(electronArgs = []) {
  const child = spawn(electronPath, ['.', ...electronArgs, ...appArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });

  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
    process.exit(1);
  });
}

function runWithXvfb(electronArgs = []) {
  const allArgs = [...electronArgs, ...appArgs];

  const child = spawn('xvfb-run', [
    '--auto-servernum',
    '--server-args=-screen 0 1280x720x24',
    electronPath,
    '.',
    ...allArgs
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  });

  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error('Failed to start xvfb-run:', err.message);
    console.error('Install xvfb: sudo apt-get install xvfb');
    process.exit(1);
  });
}

console.log(`Starting Electron in headless mode on ${os}...`);
if (appArgs.length > 0) {
  console.log(`App arguments: ${appArgs.join(' ')}`);
}

if (os === 'linux') {
  if (hasXvfb()) {
    console.log('Using xvfb-run for virtual framebuffer');
    runWithXvfb();
  } else {
    console.log('xvfb-run not found, trying offscreen rendering');
    console.log('For better results: sudo apt-get install xvfb');
    runElectron(['--enable-features=UseOzonePlatform', '--ozone-platform=headless']);
  }
} else {
  // macOS and Windows: use offscreen rendering
  runElectron(['--enable-logging', '--disable-gpu']);
}
