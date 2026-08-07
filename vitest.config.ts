/**
 * vitest.config.ts
 * Runs worker-side unit tests in Node environment.
 * Node 20+ provides globalThis.crypto (Web Crypto API) natively.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['worker/lib/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
