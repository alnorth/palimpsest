import { describe, it, expect, vi } from 'vitest'
import { updatePending, ConcurrentModificationError, MemoryPendingEventStore } from './pendingEventStore'
import type { PendingEventStore } from './pendingEventStore'
import type { PalimpsestEvent } from './events'
import type { TaskId, SphereId, EventId } from './ids'

let eventCounter = 0
function makeEvent(): PalimpsestEvent {
  const n = ++eventCounter
  return {
    type: 'task.created',
    id: `evt${n}` as EventId,
    occurredAt: '2024-01-01T00:00:00.000Z',
    taskId: `tsk${n}` as TaskId,
    sphereId: 'sph1' as SphereId,
    title: `Test task ${n}`,
    description: '',
  }
}

describe('updatePending', () => {
  it('loads current events and saves the result of compute()', async () => {
    const store = new MemoryPendingEventStore()
    const ev = makeEvent()
    await updatePending(store, current => [...current, ev])
    expect(await store.load()).toEqual([ev])
  })

  it('retries compute() against a fresh load() when save() throws ConcurrentModificationError', async () => {
    const backing: PalimpsestEvent[] = []
    let saveAttempts = 0
    const store: PendingEventStore = {
      size: 0,
      load: vi.fn(async () => [...backing]),
      save: vi.fn(async (events: PalimpsestEvent[]) => {
        saveAttempts++
        if (saveAttempts === 1) {
          // Simulate another tab writing in between our load() and save().
          backing.push(makeEvent())
          throw new ConcurrentModificationError()
        }
        backing.splice(0, backing.length, ...events)
      }),
    }
    const ev = makeEvent()
    await updatePending(store, current => [...current, ev])
    expect(store.save).toHaveBeenCalledTimes(2)
    expect(store.load).toHaveBeenCalledTimes(2)
    // Second attempt's compute() must run against the post-conflict backing, not stale data.
    expect(backing).toHaveLength(2)
    expect(backing.some(e => e.id === ev.id)).toBe(true)
  })

  it('gives up and rethrows after too many consecutive conflicts', async () => {
    const store: PendingEventStore = {
      size: 0,
      load: vi.fn(async () => []),
      save: vi.fn(async () => { throw new ConcurrentModificationError() }),
    }
    await expect(updatePending(store, current => current)).rejects.toThrow(ConcurrentModificationError)
  })

  it('propagates errors that are not ConcurrentModificationError without retrying', async () => {
    const store: PendingEventStore = {
      size: 0,
      load: vi.fn(async () => []),
      save: vi.fn(async () => { throw new Error('disk full') }),
    }
    await expect(updatePending(store, current => current)).rejects.toThrow('disk full')
    expect(store.save).toHaveBeenCalledTimes(1)
  })
})
