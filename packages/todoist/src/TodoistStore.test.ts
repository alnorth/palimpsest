import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoistStore } from './TodoistStore.js'
import * as api from './api.js'
import { createEmptyState, buildStateFromConfig, MemoryJsonStore } from 'palimpsest'
import type { PalimpsestEvent, SphereId, TaskId, EventId, JsonStore } from 'palimpsest'
import type { SyncResponse } from './api.js'
import type { TodoistCache } from './TodoistStore.js'

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
})

describe('cache persistence', () => {
  function makeCacheStore(cache?: TodoistCache): JsonStore<TodoistCache> {
    const store = new MemoryJsonStore<TodoistCache>()
    if (cache !== undefined) void store.save(cache)
    return store
  }

  it('seeds syncToken from a persisted cache on init', async () => {
    vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
    const cacheStore = makeCacheStore({ syncToken: 'saved-token', events: [] })
    const store = new TodoistStore('fake-token', { initialState: baseState, cacheStore })

    await store.init()

    expect(vi.mocked(api.sync)).toHaveBeenCalledWith('fake-token', expect.objectContaining({ syncToken: 'saved-token' }))
  })

  it('seeds baseEvents from a persisted cache on init', async () => {
    vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
    const cachedEvent = makeTaskEvent()
    const cacheStore = makeCacheStore({ syncToken: 'saved-token', events: [cachedEvent] })
    const store = new TodoistStore('fake-token', { initialState: baseState, cacheStore })

    await store.init()
    const events = await store.readAllEvents()

    expect(events.some(e => e.id === cachedEvent.id)).toBe(true)
  })

  it('defaults to a full sync (syncToken "*") when no cache is persisted', async () => {
    vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
    const cacheStore = makeCacheStore()
    const store = new TodoistStore('fake-token', { initialState: baseState, cacheStore })

    await store.init()

    expect(vi.mocked(api.sync)).toHaveBeenCalledWith('fake-token', expect.objectContaining({ syncToken: '*' }))
  })

  it('saves the updated cache after a successful sync', async () => {
    vi.mocked(api.sync).mockResolvedValue({
      sync_token: 'new-token',
      full_sync: true,
      projects: [],
      items: [],
    })
    const cacheStore = makeCacheStore()
    const saveSpy = vi.spyOn(cacheStore, 'save')
    const store = new TodoistStore('fake-token', { initialState: baseState, cacheStore })

    await store.init()

    expect(saveSpy).toHaveBeenCalledWith({ syncToken: 'new-token', events: [] })
  })

  it('behaves as before when no cacheStore is provided', async () => {
    vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC, full_sync: false })
    const store = new TodoistStore('fake-token', { initialState: baseState })

    await store.init()

    expect(vi.mocked(api.sync)).toHaveBeenCalledWith('fake-token', expect.objectContaining({ syncToken: '*' }))
  })
})
