import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoistStore } from './TodoistStore.js'
import * as api from './api.js'
import { createEmptyState, buildStateFromConfig } from 'palimpsest'
import type { PalimpsestEvent, SphereId, TaskId, EventId } from 'palimpsest'
import type { SyncReadResponse } from './api.js'

vi.mock('./api.js')

const SPHERE_ID = 'sph1' as SphereId
const initialConfig = [{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]
const baseState = { ...createEmptyState(), ...buildStateFromConfig(initialConfig) }

const EMPTY_READ: SyncReadResponse = {
  sync_token: 'tok1',
  full_sync: false,
  items: [],
  projects: [],
}

let eventSeq = 0
function makeTaskEvent(): PalimpsestEvent {
  const n = ++eventSeq
  return {
    id: `ev${n}` as EventId,
    type: 'task.created',
    taskId: `tsk${n}` as TaskId,
    occurredAt: new Date().toISOString(),
    title: `Task ${n}`,
    description: '',
    sphereId: SPHERE_ID,
  }
}

function makeStore(initialState = baseState) {
  return new TodoistStore('fake-token', { initialState })
}

beforeEach(() => {
  vi.resetAllMocks()
  eventSeq = 0
})

describe('syncState', () => {
  it('starts idle', () => {
    const store = makeStore()
    expect(store.syncState.health).toBe('idle')
    expect(store.syncState.lastError).toBeUndefined()
    expect(store.syncState.unsyncedCount).toBe(0)
  })

  describe('doRefresh (via refresh())', () => {
    it('stays idle and clears error after a successful refresh', async () => {
      vi.mocked(api.syncRead).mockResolvedValue({ ...EMPTY_READ, full_sync: false })
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.lastError).toBeUndefined()
    })

    it('becomes error when syncRead throws', async () => {
      vi.mocked(api.syncRead).mockRejectedValue(new Error('network failure'))
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('error')
      expect(store.syncState.lastError).toBe('network failure')
    })

    it('clears error after a successful refresh following a failure', async () => {
      vi.mocked(api.syncRead)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ ...EMPTY_READ, full_sync: false })
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('error')
      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.lastError).toBeUndefined()
    })

    it('notifies subscribers even when syncRead throws', async () => {
      vi.mocked(api.syncRead).mockRejectedValue(new Error('offline'))
      const store = makeStore()
      const listener = vi.fn()
      store.subscribe(listener)
      await store.refresh()
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('appendEvents', () => {
    it('queues events in the pending store immediately', async () => {
      const store = makeStore()
      await store.appendEvents([makeTaskEvent()])
      expect(store.syncState.unsyncedCount).toBe(1)
    })
  })

  describe('pending event retry in doRefresh', () => {
    it('retries pending events on next refresh after a failed flush', async () => {
      vi.mocked(api.syncWrite)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ sync_status: {}, temp_id_mapping: {} })
      vi.mocked(api.syncRead).mockResolvedValue({ ...EMPTY_READ, full_sync: false })

      const store = makeStore()
      await store.appendEvents([makeTaskEvent()])
      expect(store.syncState.unsyncedCount).toBe(1)

      await store.refresh()
      expect(store.syncState.health).toBe('error')
      expect(store.syncState.unsyncedCount).toBe(1)

      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.unsyncedCount).toBe(0)
      expect(vi.mocked(api.syncWrite)).toHaveBeenCalledTimes(2)
    })
  })
})
