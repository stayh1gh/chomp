/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))

// Built to dist/ and served by ../serve.mjs, which swaps __TOKEN__ in index.html for the
// per-process write token. In dev, serve.mjs mounts this config as middleware (--dev), so the
// page keeps the board's own origin and same-origin writes work.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(here, 'src') } },
  server: {
    // Dev only: serve files from this package and the design-system tokens, nothing else in
    // the repo (board/ holds secrets like .companion-secret).
    fs: { strict: true, allow: [here, path.join(here, '..', '..', '..', 'agentos-design-system')] },
  },
  // DynamicIcon (flow.yaml's column icons, no rebuild when they change) puts lucide's import map
  // in the main chunk: ~530 kB, served from this machine.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    // The repo sits on a network volume that macOS litters with AppleDouble (._*) files.
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*'],
  },
})
