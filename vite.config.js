import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'src/ui/index.html',
    },
  },
  resolve: {
    alias: {
      '$stores': '/src/ui/stores',
      '$components': '/src/ui/components',
      '$lib': '/src/ui/lib',
    },
  },
  base: './',
});
