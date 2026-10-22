import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    // This project lives on a network volume that macOS litters with AppleDouble
    // (._*) sidecar files alongside every real one — exclude them explicitly so
    // vitest doesn't try to run them as test files.
    exclude: [...configDefaults.exclude, '**/._*'],
  },
})
