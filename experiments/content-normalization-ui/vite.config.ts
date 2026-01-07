import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': resolve(__dirname, './src/lib'),
      '$components': resolve(__dirname, './src/components'),
      // Allow importing from main app types
      '$app-types': resolve(__dirname, '../../src/types'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
});
