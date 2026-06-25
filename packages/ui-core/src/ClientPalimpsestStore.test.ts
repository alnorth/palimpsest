import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClientPalimpsestStore } from './ClientPalimpsestStore.js'
import type { PendingEventStore } from './PendingEventStore.js'
import { createEmptyState, createSphere } from 'palimpsest'
import type { PalimpsestEvent } from 'palimpsest'

class SpyPendingStore implements PendingEventStore {
  saved: PalimpsestEvent[] | undefined
  constructor(private initial: PalimpsestEvent[] = []) {}
  async load(): Promise<PalimpsestEvent[]> { return this.initial }
  async save(events: PalimpsestEvent[]): Promise<void> { this.saved = events }
}

function makeSphereEvent(): PalimpsestEvent {
  const state = createEmptyState()
  return createSphere(state, { name: 'Work' })[0]!
}

// Minimal sync function mock
function makeServerWithEvents(storedEvents: PalimpsestEvent[], serverSeq?: number) {
  const seq = serverSeq ?? storedEvents.length
  return vi.fn(async (clientSeq: number, events: PalimpsestEvent[]) => {
    const missed = storedEvents.slice(clientSeq)
    if (events.length === 0) {
      return { status: 'ok' as const, serverSeq: seq, missedEvents: missed }
    }
    return { status: 'ok' as const, serverSeq: seq + events.length, missedEvents: missed }
  })
}

describe('ClientPalimpsestStore', () => {
  describe('getState()', () => {
    it('returns empty state before sync', async () => {
      const syncFn = makeServerWithEvents([])
      const store = new ClientPalimpsestStore(syncFn)
      const state = await store.getState()
      expect(state.spheres.size).toBe(0)
      expect(state.tasks.size).toBe(0)
    })

    it('reflects unsynced events optimistically', async () => {
      const syncFn = makeServerWithEvents([])
      const store = new ClientPalimpsestStore(syncFn)
      const ev = makeSphereEvent()
      await store.appendEvents([ev])
      const state = await store.getState()
      expect(state.spheres.size).toBe(1)
    })

    it('reflects server events after sync', async () => {
      const ev = makeSphereEvent()
      const syncFn = makeServerWithEvents([ev])
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync()
      const state = await store.getState()
      expect(state.spheres.size).toBe(1)
    })
  })

  describe('unsyncedCount', () => {
    it('is 0 initially', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      expect(store.unsyncedCount).toBe(0)
    })

    it('increments when events are appended', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const ev = makeSphereEvent()
      await store.appendEvents([ev])
      expect(store.unsyncedCount).toBe(1)
    })

    it('returns to 0 after successful sync', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const ev = makeSphereEvent()
      await store.appendEvents([ev])
      await store.sync()
      expect(store.unsyncedCount).toBe(0)
    })
  })

  describe('subscribe()', () => {
    it('fires callback when appendEvents is called', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const listener = vi.fn()
      store.subscribe(listener)
      await store.appendEvents([makeSphereEvent()])
      expect(listener).toHaveBeenCalled()
    })

    it('fires callback when sync brings new events', async () => {
      const ev = makeSphereEvent()
      const syncFn = makeServerWithEvents([ev])
      const store = new ClientPalimpsestStore(syncFn)
      const listener = vi.fn()
      store.subscribe(listener)
      await store.sync()
      expect(listener).toHaveBeenCalled()
    })

    it('does not fire after unsubscribe', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const listener = vi.fn()
      const unsub = store.subscribe(listener)
      unsub()
      await store.appendEvents([makeSphereEvent()])
      expect(listener).not.toHaveBeenCalled()
    })

    it('supports multiple subscribers', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const a = vi.fn()
      const b = vi.fn()
      store.subscribe(a)
      store.subscribe(b)
      await store.appendEvents([makeSphereEvent()])
      expect(a).toHaveBeenCalled()
      expect(b).toHaveBeenCalled()
    })
  })

  describe('sync()', () => {
    it('advances baseSeq after pulling server events', async () => {
      const ev = makeSphereEvent()
      const syncFn = makeServerWithEvents([ev], 1)
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync()
      // A second sync with the same server state should not request events again
      await store.sync()
      // Second call should pass clientSeq=1 (not 0)
      const secondCallSeq = (syncFn.mock.calls as any)[1][0]
      expect(secondCallSeq).toBe(1)
    })

    it('clears unsyncedEvents after successful upload', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      await store.appendEvents([makeSphereEvent()])
      expect(store.unsyncedCount).toBe(1)
      await store.sync()
      expect(store.unsyncedCount).toBe(0)
    })

    it('getState() still reflects submitted events after successful sync', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      await store.appendEvents([makeSphereEvent()])
      await store.sync()
      const state = await store.getState()
      expect(state.spheres.size).toBe(1)
    })

    it('does not fire subscriber when sync returns no new events', async () => {
      const syncFn = makeServerWithEvents([])
      const store = new ClientPalimpsestStore(syncFn)
      const listener = vi.fn()
      store.subscribe(listener)
      await store.sync()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('readAllEvents()', () => {
    it('returns base events plus unsynced events', async () => {
      const serverEv = makeSphereEvent()
      const syncFn = makeServerWithEvents([serverEv])
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync() // brings serverEv into baseState
      const localEv = makeSphereEvent()
      await store.appendEvents([localEv])
      const events = await store.readAllEvents()
      // Should contain both server and local events
      expect(events.length).toBe(2)
    })
  })

  describe('PendingEventStore integration', () => {
    it('restores unsynced events from pending store on init', async () => {
      const ev = makeSphereEvent()
      const pending = new SpyPendingStore([ev])
      const store = new ClientPalimpsestStore(makeServerWithEvents([]), { pendingStore: pending })
      await store.init()
      expect(store.unsyncedCount).toBe(1)
      const state = await store.getState()
      expect(state.spheres.size).toBe(1)
    })

    it('saves to pending store when appendEvents is called', async () => {
      const pending = new SpyPendingStore()
      const store = new ClientPalimpsestStore(makeServerWithEvents([]), { pendingStore: pending })
      await store.appendEvents([makeSphereEvent()])
      expect(pending.saved).toBeDefined()
      expect(pending.saved!).toHaveLength(1)
    })

    it('saves empty array to pending store after successful sync', async () => {
      const pending = new SpyPendingStore()
      const store = new ClientPalimpsestStore(makeServerWithEvents([]), { pendingStore: pending })
      await store.appendEvents([makeSphereEvent()])
      await store.sync()
      expect(pending.saved!).toHaveLength(0)
    })

    it('always syncs from seq 0 on restart regardless of prior baseSeq', async () => {
      const ev = makeSphereEvent()
      const pending = new SpyPendingStore([ev])
      const syncFn = makeServerWithEvents([], 5)
      const store = new ClientPalimpsestStore(syncFn, { pendingStore: pending })
      await store.init()
      await store.sync()
      const seqPassedToSync = (syncFn.mock.calls as any)[0][0]
      // baseSeq starts at 0 — pending store only restores unsyncedEvents
      expect(seqPassedToSync).toBe(0)
    })
  })

  describe('syncHealth', () => {
    it('starts idle', () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      expect(store.syncHealth).toBe('idle')
    })

    it('becomes error when syncFn throws', async () => {
      const store = new ClientPalimpsestStore(vi.fn().mockRejectedValue(new Error('network')))
      await store.sync()
      expect(store.syncHealth).toBe('error')
    })

    it('exposes the error message on lastSyncError', async () => {
      const store = new ClientPalimpsestStore(vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')))
      await store.sync()
      expect(store.lastSyncError).toBe('fetch failed: ECONNREFUSED')
    })

    it('clears lastSyncError after successful sync', async () => {
      let fail = true
      const syncFn = vi.fn(async () => {
        if (fail) throw new Error('timeout')
        return { status: 'ok' as const, serverSeq: 0, missedEvents: [] }
      })
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync()
      expect(store.lastSyncError).toBe('timeout')
      fail = false
      await store.sync()
      expect(store.lastSyncError).toBeUndefined()
    })

    it('handles non-Error throws by converting to string', async () => {
      const store = new ClientPalimpsestStore(vi.fn().mockRejectedValue('plain string error'))
      await store.sync()
      expect(store.lastSyncError).toBe('plain string error')
    })

    it('becomes conflict when server returns conflict status', async () => {
      const conflictEv = makeSphereEvent()
      const syncFn = vi.fn().mockResolvedValue({
        status: 'conflict',
        serverSeq: 1,
        missedEvents: [],
        reason: 'task-deleted',
        conflictingEvents: [conflictEv],
      })
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync()
      expect(store.syncHealth).toBe('conflict')
      expect(store.pendingConflicts).toHaveLength(1)
      expect(store.pendingConflicts[0]?.reason).toBe('task-deleted')
    })

    it('returns to idle and clears conflicts after successful sync', async () => {
      let fail = true
      const syncFn = vi.fn(async () => {
        if (fail) throw new Error('network')
        return { status: 'ok' as const, serverSeq: 0, missedEvents: [] }
      })
      const store = new ClientPalimpsestStore(syncFn)
      await store.sync()
      expect(store.syncHealth).toBe('error')
      fail = false
      await store.sync()
      expect(store.syncHealth).toBe('idle')
      expect(store.pendingConflicts).toHaveLength(0)
    })

    it('notifies subscribers when sync health changes', async () => {
      const store = new ClientPalimpsestStore(vi.fn().mockRejectedValue(new Error('network')))
      const listener = vi.fn()
      store.subscribe(listener)
      await store.sync()
      expect(listener).toHaveBeenCalled()
    })

    it('does not notify subscribers when sync returns no changes and stays idle', async () => {
      const store = new ClientPalimpsestStore(makeServerWithEvents([]))
      const listener = vi.fn()
      store.subscribe(listener)
      await store.sync()
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
