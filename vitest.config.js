import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js',
        'src/main/main.js', // Electron main process - tested separately
      ],
    },
    // Performance optimizations for fast CI
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Faster for small test suites
      },
    },
  },
  resolve: {
    alias: {
      '$stores': '/src/ui/stores',
      '$components': '/src/ui/components',
      '$lib': '/src/ui/lib',
    },
  },
});
