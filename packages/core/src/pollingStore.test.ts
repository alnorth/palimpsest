import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PollingStore } from './pollingStore'
import { ConcurrentModificationError } from './pendingEventStore'
import type { PendingEventStore } from './pendingEventStore'
import { createEmptyState } from './projection'
import { buildStateFromConfig } from './config'
import type { PalimpsestEvent } from './events'
import type { TaskId, SphereId, EventId } from './ids'
import type { ProjectionState } from './projection'

const SPHERE_ID = 'sph1' as SphereId
const testInitialState = { ...createEmptyState(), ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]) }

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

class TestPollingStore extends PollingStore {
  syncCalls = 0

  constructor(opts: { pendingStore?: PendingEventStore; initialState?: ProjectionState } = {}) {
    super(opts)
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    return this.pendingStore.load()
  }

  override async sync(): Promise<void> {
    this.syncCalls++
  }
}

function makeStore(opts: { pendingStore?: PendingEventStore; initialState?: ProjectionState } = {}) {
  return new TestPollingStore({ initialState: testInitialState, ...opts })
}

describe('PollingStore', () => {
  beforeEach(() => { eventCounter = 0 })

  describe('doAppend', () => {
    it('retries the read-modify-write when pendingStore.save() reports a concurrent writer', async () => {
      const backing: PalimpsestEvent[] = []
      let saveAttempts = 0
      const pendingStore: PendingEventStore = {
        size: 0,
        load: vi.fn(async () => [...backing]),
        save: vi.fn(async (events: PalimpsestEvent[]) => {
          saveAttempts++
          if (saveAttempts === 1) {
            backing.push(makeEvent()) // another "tab" wrote in between
            throw new ConcurrentModificationError()
          }
          backing.splice(0, backing.length, ...events)
        }),
      }
      const store = makeStore({ pendingStore })
      const ev = makeEvent()
      await store.appendEvents([ev])
      expect(pendingStore.save).toHaveBeenCalledTimes(2)
      expect(backing).toHaveLength(2)
      expect(backing.some(e => e.id === ev.id)).toBe(true)
    })
  })

  describe('storage event', () => {
    const originalWindow = (globalThis as any).window

    afterEach(() => {
      (globalThis as any).window = originalWindow
    })

    it('notifies subscribers when a "storage" event fires, and stops listening after stop()', () => {
      const listeners: Record<string, Array<() => void>> = {}
      const fakeWindow = {
        addEventListener: (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn) },
        removeEventListener: (type: string, fn: () => void) => {
          listeners[type] = (listeners[type] ?? []).filter(f => f !== fn)
        },
      };
      (globalThis as any).window = fakeWindow

      const store = makeStore()
      const listener = vi.fn()
      store.subscribe(listener)
      store.start()

      expect(listeners.storage).toHaveLength(1)
      listeners.storage?.forEach(fn => fn())
      expect(listener).toHaveBeenCalled()

      store.stop()
      expect(listeners.storage).toHaveLength(0)
    })

    it('ignores storage events for unrelated localStorage keys', () => {
      const listeners: Record<string, Array<(event: any) => void>> = {}
      const fakeWindow = {
        addEventListener: (type: string, fn: (event: any) => void) => { (listeners[type] ??= []).push(fn) },
        removeEventListener: (type: string, fn: (event: any) => void) => {
          listeners[type] = (listeners[type] ?? []).filter(f => f !== fn)
        },
      };
      (globalThis as any).window = fakeWindow

      const pendingStore: PendingEventStore = {
        key: 'palimpsest_pending',
        size: 0,
        load: vi.fn(async () => []),
        save: vi.fn(async () => {}),
      }
      const store = makeStore({ pendingStore })
      const listener = vi.fn()
      store.subscribe(listener)
      store.start()

      listeners.storage?.forEach(fn => fn({ key: 'some_other_key' }))
      expect(listener).not.toHaveBeenCalled()

      listeners.storage?.forEach(fn => fn({ key: 'palimpsest_pending' }))
      expect(listener).toHaveBeenCalled()

      store.stop()
    })
  })
})
