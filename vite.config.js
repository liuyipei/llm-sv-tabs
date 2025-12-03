import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [svelte({
    configFile: resolve(__dirname, 'svelte.config.js')
  })],
  root: 'src/ui',
  build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: resolve(__dirname, 'src/ui/index.html'),
    },
    emptyOutDir: true,
    sourcemap: true,   // Enable source maps for debugging
    minify: false,     // Disable minification for debugging
  },
  resolve: {
    alias: {
      '$stores': resolve(__dirname, 'src/ui/stores'),
      '$components': resolve(__dirname, 'src/ui/components'),
      '$lib': resolve(__dirname, 'src/ui/lib'),
      '$utils': resolve(__dirname, 'src/ui/utils'),
      '$config': resolve(__dirname, 'src/ui/config'),
      '~': resolve(__dirname, 'node_modules'),
    },
    // Ensure node_modules resolution works from project root
    preserveSymlinks: false,
  },
  // Configure server and build to resolve from project root
  server: {
    fs: {
      // Allow serving files from project root (for node_modules)
      allow: [resolve(__dirname)],
    },
  },
  base: './',
});
