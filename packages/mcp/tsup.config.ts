import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  conditions: ['source'],
  noExternal: [/^@alnorth\/palimpsest/],
  target: 'node24',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
