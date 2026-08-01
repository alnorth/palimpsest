import { describe, it, expect } from 'vitest'
import { FileJsonStore } from './FileJsonStore.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function withTempDir(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'palimpsest-test-'))
    try {
      await fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

describe('FileJsonStore', () => {
  it('returns undefined when file does not exist', withTempDir(async dir => {
    const store = new FileJsonStore<{ syncToken: string }>(join(dir, 'cache.json'))
    expect(await store.load()).toBeUndefined()
  }))

  it('round-trips an arbitrary value', withTempDir(async dir => {
    const store = new FileJsonStore<{ syncToken: string; count: number }>(join(dir, 'cache.json'))
    await store.save({ syncToken: 'tok1', count: 3 })
    expect(await store.load()).toEqual({ syncToken: 'tok1', count: 3 })
  }))

  it('overwrites on subsequent saves', withTempDir(async dir => {
    const store = new FileJsonStore<number[]>(join(dir, 'cache.json'))
    await store.save([1, 2, 3])
    await store.save([4])
    expect(await store.load()).toEqual([4])
  }))
})
