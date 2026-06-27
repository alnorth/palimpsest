import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
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
