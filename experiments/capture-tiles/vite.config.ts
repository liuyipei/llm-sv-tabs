import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  root: 'src/ui',
  base: './',
  build: {
    outDir: '../../dist',
    emptyDirFirst: true,
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, 'src/ui/lib'),
      $components: resolve(__dirname, 'src/ui/components'),
      $shared: resolve(__dirname, 'src/shared'),
    },
  },
});
