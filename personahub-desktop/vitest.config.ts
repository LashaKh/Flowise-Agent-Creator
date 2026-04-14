import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Main-process tests need Node.js, not jsdom
      ['electron/**', 'node'],
      ['openclaw/**', 'node'],
      ['db/**', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
});
