import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: [
      'tests/src/**/*.test.ts',
      'tests/src/**/*.test.tsx',
      'tests/server/**/*.test.js',
      'tests/server/**/*.test.mjs',
    ],
    setupFiles: ['tests/setup/canvas-polyfill.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/hooks/**', 'server/ai-transformers.mjs', 'server/logger.mjs', 'server/utils.mjs'],
      exclude: ['src/lib/tcg-database.ts', 'src/lib/queue-api.ts', 'src/lib/api-fetch.ts'],
    },
  },
});
