import { defineConfig } from 'tsup'
import { writeFileSync } from 'node:fs'

export default defineConfig({
  entry: ['src/handlers/handler.ts'],
  format: ['esm'],
  outDir: 'dist',
  // @aws-sdk is available in the Lambda runtime — don't bundle it
  external: ['@aws-sdk/client-dynamodb', '@aws-sdk/client-secrets-manager', '@aws-sdk/lib-dynamodb'],
  // palimpsest is a workspace dep — force-bundle it since it won't be on Lambda
  noExternal: ['palimpsest'],
  bundle: true,
  sourcemap: true,
  onSuccess() {
    // Lambda needs this to treat .js files as ESM
    writeFileSync('dist/package.json', JSON.stringify({ type: 'module' }))
  },
})
