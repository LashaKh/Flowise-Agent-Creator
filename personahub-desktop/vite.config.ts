import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

// Bake build-time secrets into main + preload bundles. Vite replaces the
// LITERAL IDENTIFIER `__PERSONAHUB_OPENROUTER_KEY__` with the JSON-
// stringified value at build time, so the source file stays clean (no
// key on GitHub) but the compiled output has the key inlined. CI sets
// the env from GitHub Actions secret PERSONAHUB_OPENROUTER_KEY; local
// dev reads from .env.local or shell. If unset, the bundled key is "".
//
// Using a unique identifier (instead of `process.env.X`) avoids any
// interaction with vite-plugin-electron / rollup's own env-replacement
// behavior, which can produce surprising minified shapes when the value
// is empty or undefined (a previous version emitted a literal `"-"` here
// instead of the expected empty string).
const bundledOpenRouterKey = process.env.PERSONAHUB_OPENROUTER_KEY ?? '';
const buildDefines = {
  __PERSONAHUB_OPENROUTER_KEY__: JSON.stringify(bundledOpenRouterKey),
};
// Loud sanity-check log so CI builds never silently ship without the key.
// Mask all but the first 6 chars so the log doesn't leak the secret.
if (bundledOpenRouterKey) {
  const masked = bundledOpenRouterKey.slice(0, 10) + '…(' + bundledOpenRouterKey.length + ' chars)';
  console.log('[vite.config] PERSONAHUB_OPENROUTER_KEY found:', masked);
} else {
  console.warn('[vite.config] PERSONAHUB_OPENROUTER_KEY is empty — bundled key disabled');
}

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
