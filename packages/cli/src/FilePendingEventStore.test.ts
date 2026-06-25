import { describe, it, expect } from 'vitest'
import { FilePendingEventStore } from './FilePendingEventStore.js'
import { createEmptyState, createSphere } from 'palimpsest'
import type { PalimpsestEvent } from 'palimpsest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeSphereEvent(): PalimpsestEvent {
  return createSphere(createEmptyState(), { name: 'Work' })[0]!
}

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

describe('FilePendingEventStore', () => {
  it('loads empty array when file does not exist', withTempDir(async dir => {
    const store = new FilePendingEventStore(join(dir, 'pending.json'))
    expect(await store.load()).toEqual([])
  }))

  it('round-trips unsyncedEvents', withTempDir(async dir => {
    const store = new FilePendingEventStore(join(dir, 'pending.json'))
    const ev = makeSphereEvent()
    await store.save([ev])
    const loaded = await store.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.id).toBe(ev.id)
  }))

  it('overwrites on subsequent saves', withTempDir(async dir => {
    const store = new FilePendingEventStore(join(dir, 'pending.json'))
    await store.save([makeSphereEvent()])
    await store.save([])
    expect(await store.load()).toEqual([])
  }))
})
