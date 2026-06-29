import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
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
