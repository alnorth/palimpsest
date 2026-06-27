import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'node:fs': path.resolve(__dirname, 'src/stubs/node-fs.ts'),
    },
  },
  test: {
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
  },
})
