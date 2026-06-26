// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStoragePendingEventStore } from './LocalStoragePendingEventStore.js'
import type { PalimpsestEvent, TaskId, SphereId, EventId } from 'palimpsest'

function makeEvent(id: string): PalimpsestEvent {
  return {
    type: 'task.created',
    id: id as EventId,
    occurredAt: '2024-01-01T00:00:00.000Z',
    taskId: 'task1' as TaskId,
    sphereId: 'sph1' as SphereId,
    title: 'Test task',
    description: '',
  }
}

describe('LocalStoragePendingEventStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when localStorage is empty', async () => {
    const store = new LocalStoragePendingEventStore()
    expect(await store.load()).toEqual([])
  })

  it('round-trips events via save and load', async () => {
    const store = new LocalStoragePendingEventStore()
    const events = [makeEvent('evt1'), makeEvent('evt2')]
    await store.save(events)
    expect(await store.load()).toEqual(events)
  })

  it('returns empty array when stored value is corrupt JSON', async () => {
    localStorage.setItem('palimpsest_pending', 'not valid json{')
    const store = new LocalStoragePendingEventStore()
    expect(await store.load()).toEqual([])
  })

  it('overwrites previous data on each save', async () => {
    const store = new LocalStoragePendingEventStore()
    await store.save([makeEvent('evt1')])
    await store.save([makeEvent('evt2')])
    const loaded = await store.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.id).toBe('evt2')
  })

  it('uses the provided localStorage key', async () => {
    const store = new LocalStoragePendingEventStore('custom_key')
    const events = [makeEvent('evt1')]
    await store.save(events)
    expect(localStorage.getItem('custom_key')).not.toBeNull()
    expect(localStorage.getItem('palimpsest_pending')).toBeNull()
    expect(await store.load()).toEqual(events)
  })

  it('saves empty array and clears storage', async () => {
    const store = new LocalStoragePendingEventStore()
    await store.save([makeEvent('evt1')])
    await store.save([])
    expect(await store.load()).toEqual([])
  })
})
