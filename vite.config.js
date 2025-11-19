import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: '../../dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Ensure the HTML file is output to the root of dist
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '$stores': '/src/ui/stores',
      '$components': '/src/ui/components',
      '$lib': '/src/ui/lib',
    },
  },
  base: './',
  // Configure the root to be src/ui so that index.html is at the root
  root: 'src/ui',
});
