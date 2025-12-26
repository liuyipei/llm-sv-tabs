#!/usr/bin/env node
/**
 * Bundle preload scripts for Electron
 *
 * Electron preload scripts with sandbox:true cannot use ES6 imports.
 * This script bundles them with esbuild to CommonJS format.
 */

import { build } from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const preloadScripts = [
  {
    entry: 'src/main/preload.ts',
    output: 'dist-main/main/preload.js',
  },
  {
    entry: 'src/main/screenshot-overlay-preload.ts',
    output: 'dist-main/main/screenshot-overlay-preload.js',
  },
];

async function bundlePreloads() {
  console.log('Bundling preload scripts...');

  for (const script of preloadScripts) {
    try {
      await build({
        entryPoints: [join(projectRoot, script.entry)],
        bundle: true,
        platform: 'node',
        format: 'cjs', // CommonJS format for sandboxed preload
        outfile: join(projectRoot, script.output),
        external: ['electron'], // Electron APIs are provided by the runtime
        sourcemap: true,
        target: 'node18', // Match Electron's Node.js version
      });
      console.log(`✓ Bundled ${script.entry} → ${script.output}`);
    } catch (error) {
      console.error(`✗ Failed to bundle ${script.entry}:`, error);
      process.exit(1);
    }
  }

  console.log('All preload scripts bundled successfully!');
}

bundlePreloads();
