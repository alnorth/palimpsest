import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoistStore } from './TodoistStore'
import * as api from './api'
import { createEmptyState, buildStateFromConfig } from '@alnorth/palimpsest'
import type { PalimpsestEvent, SphereId, TaskId, EventId } from '@alnorth/palimpsest'
import type { SyncResponse } from './api'

vi.mock('./api.js')

const SPHERE_ID = 'sph1' as SphereId
const initialConfig = [{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]
const baseState = { ...createEmptyState(), ...buildStateFromConfig(initialConfig) }

const EMPTY_SYNC: SyncResponse = {
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
      vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.lastError).toBeUndefined()
    })

    it('becomes error when sync throws', async () => {
      vi.mocked(api.sync).mockRejectedValue(new Error('network failure'))
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('error')
      expect(store.syncState.lastError).toBe('network failure')
    })

    it('clears error after a successful refresh following a failure', async () => {
      vi.mocked(api.sync)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
      const store = makeStore()
      await store.refresh()
      expect(store.syncState.health).toBe('error')
      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.lastError).toBeUndefined()
    })

    it('notifies subscribers even when sync throws', async () => {
      vi.mocked(api.sync).mockRejectedValue(new Error('offline'))
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

  describe('readAllEvents', () => {
    it('returns pending events before any sync', async () => {
      const store = makeStore()
      await store.appendEvents([makeTaskEvent()])
      const events = await store.readAllEvents()
      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe('task.created')
    })

    it('returns base events from Todoist after a full sync', async () => {
      vi.mocked(api.sync).mockResolvedValue({
        sync_token: 'tok2',
        full_sync: true,
        projects: [],
        items: [],
      })
      const store = makeStore()
      await store.refresh()
      const events = await store.readAllEvents()
      expect(Array.isArray(events)).toBe(true)
    })
  })

  describe('pending event retry in doRefresh', () => {
    it('retries pending events on next refresh after a failed flush', async () => {
      vi.mocked(api.sync)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })

      const store = makeStore()
      await store.appendEvents([makeTaskEvent()])
      expect(store.syncState.unsyncedCount).toBe(1)

      await store.refresh()
      expect(store.syncState.health).toBe('error')
      expect(store.syncState.unsyncedCount).toBe(1)

      await store.refresh()
      expect(store.syncState.health).toBe('idle')
      expect(store.syncState.unsyncedCount).toBe(0)
      expect(vi.mocked(api.sync)).toHaveBeenCalledTimes(2)
    })
  })

  describe('a pending event that fails to convert to Todoist commands', () => {
    // task.recurred looks its task up in the last-synced base state, not the pending-inclusive
    // state appendEvents validates against — so a task created and then recurred in the same
    // unsynced batch (never an unreasonable sequence: complete a recurring task twice before a
    // sync ever gets a chance to run) exists for validateBatch's purposes but not yet for
    // buildCommands'.
    function appendCreatedThenRecurredTask(store: TodoistStore): Promise<void> {
      const taskId = 'tsk1' as TaskId
      return store.appendEvents([
        {
          id: 'ev1' as EventId, type: 'task.created', taskId,
          occurredAt: new Date().toISOString(), title: 'Recurring task', description: '', sphereId: SPHERE_ID,
        },
        { id: 'ev2' as EventId, type: 'task.recurred', taskId, occurredAt: new Date().toISOString(), newDueDate: '2026-01-02' },
      ])
    }

    // Regression test: this previously threw synchronously inside sync(), before the network
    // try/catch, so it never called api.sync at all, never set health/lastError, and — because
    // it happens again on every future attempt — silently blocked every later refresh() (poll
    // and manual alike) forever, indistinguishable from a sync that was never even attempted.
    it('surfaces as a sync error instead of throwing out of refresh()', async () => {
      const store = makeStore()
      await appendCreatedThenRecurredTask(store)

      await expect(store.refresh()).resolves.toBeUndefined()

      expect(store.syncState.health).toBe('error')
      expect(store.syncState.lastError).toMatch(/task.recurred.*tsk1/)
      expect(vi.mocked(api.sync)).not.toHaveBeenCalled()
    })

    it('keeps failing the same way on every later refresh, without ever throwing out of it', async () => {
      const store = makeStore()
      await appendCreatedThenRecurredTask(store)

      await expect(store.refresh()).resolves.toBeUndefined()
      await expect(store.refresh()).resolves.toBeUndefined()

      expect(store.syncState.health).toBe('error')
      expect(store.syncState.unsyncedCount).toBe(2)
      expect(vi.mocked(api.sync)).not.toHaveBeenCalled()
    })
  })
})
