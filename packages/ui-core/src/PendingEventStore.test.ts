import { describe, it, expect } from 'vitest'
import { MemoryPendingEventStore } from './PendingEventStore.js'
import { createEmptyState, createSphere } from 'palimpsest'
import type { PalimpsestEvent } from 'palimpsest'

function makeSphereEvent(): PalimpsestEvent {
  return createSphere(createEmptyState(), { name: 'Work' })[0]!
}

describe('MemoryPendingEventStore', () => {
  it('loads empty array initially', async () => {
    const store = new MemoryPendingEventStore()
    expect(await store.load()).toEqual([])
  })

  it('save is a no-op', async () => {
    const store = new MemoryPendingEventStore()
    await store.save([makeSphereEvent()])
    expect(await store.load()).toEqual([])
  })
})
