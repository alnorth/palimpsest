import { describe, it, expect } from 'vitest'
import { MemoryPendingEventStore } from 'palimpsest'
import type { PalimpsestEvent, TaskId, SphereId, EventId } from 'palimpsest'

function makeTaskEvent(): PalimpsestEvent {
  return {
    id: 'evt1' as EventId,
    type: 'task.created',
    taskId: 'tsk1' as TaskId,
    occurredAt: new Date().toISOString(),
    title: 'Test task',
    description: '',
    sphereId: 'sph1' as SphereId,
  }
}

describe('MemoryPendingEventStore', () => {
  it('loads empty array initially', async () => {
    const store = new MemoryPendingEventStore()
    expect(await store.load()).toEqual([])
  })

  it('load returns what was saved', async () => {
    const store = new MemoryPendingEventStore()
    const ev = makeTaskEvent()
    await store.save([ev])
    expect(await store.load()).toEqual([ev])
  })

  it('load returns empty after saving empty array', async () => {
    const store = new MemoryPendingEventStore()
    await store.save([makeTaskEvent()])
    await store.save([])
    expect(await store.load()).toEqual([])
  })
})
