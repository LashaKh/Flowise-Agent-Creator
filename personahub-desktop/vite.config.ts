import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

// Bake build-time secrets into main + preload bundles. Vite replaces the
// LITERAL TEXT `process.env.PERSONAHUB_OPENROUTER_KEY` with the JSON-
// stringified value at build time, so the source file stays clean (no
// key on GitHub) but the compiled output has the key inlined. CI sets
// the env from GitHub Actions secret PERSONAHUB_OPENROUTER_KEY; local
// dev reads from .env.local or shell. If unset, the bundled key is "".
const buildDefines = {
  'process.env.PERSONAHUB_OPENROUTER_KEY': JSON.stringify(
    process.env.PERSONAHUB_OPENROUTER_KEY ?? '',
  ),
};

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup();
        },
        vite: {
          define: buildDefines,
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'electron-updater', 'ws', 'pdf-parse', 'mammoth', 'openclaw'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: 'preload.js',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
});
