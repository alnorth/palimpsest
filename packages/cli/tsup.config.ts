import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  conditions: ['source'],
  noExternal: [/^palimpsest/],
  target: 'node24',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
