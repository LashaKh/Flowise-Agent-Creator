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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Scope to first-party code so node_modules and dist don't skew numbers.
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'db/**/*.ts', 'openclaw/**/*.ts', 'security/**/*.ts', 'sync/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'src/types/**', 'scripts/**', 'dist/**', 'dist-electron/**'],
      // Initial thresholds deliberately LOW to reflect current baseline.
      // Ratchet these up as more tests land (Phase 4.3 ongoing).
      thresholds: {
        statements: 15,
        branches: 50,
        functions: 20,
        lines: 15,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
});
