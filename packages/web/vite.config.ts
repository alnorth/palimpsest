import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Cast needed because @vitejs/plugin-react ships vite 8 types while
  // vitest/config ships its own vite 6 peer dependency.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
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
