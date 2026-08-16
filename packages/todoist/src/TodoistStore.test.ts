import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoistStore } from './TodoistStore'
import * as api from './api'
import { createEmptyState, buildStateFromConfig, project as projectState, ConcurrentModificationError } from '@alnorth/palimpsest'
import type { PalimpsestEvent, SphereId, ProjectId, TaskId, AgendaId, EventId, PendingEventStore } from '@alnorth/palimpsest'
import type { SyncItem, SyncResponse } from './api'
import { AGENDA_PROJECT_MAP_TASK_TITLE, serializeAgendaMapping } from './sharedStorage'
import { TODOIST_INBOX_ID, TODOIST_WORK_PROJECT_ID } from './mapping'

class SpyPendingStore implements PendingEventStore {
  saved: PalimpsestEvent[] | undefined
  private current: PalimpsestEvent[]
  constructor(initial: PalimpsestEvent[] = []) { this.current = initial }
  get size(): number { return this.current.length }
  async load(): Promise<PalimpsestEvent[]> { return this.current }
  async save(events: PalimpsestEvent[]): Promise<void> { this.saved = events; this.current = events }
}

// Simulates a pendingStore whose cleanup save() always conflicts (e.g. another tab keeps
// writing), so updatePending's retries are always exhausted.
class AlwaysConflictingPendingStore implements PendingEventStore {
  constructor(private current: PalimpsestEvent[]) {}
  get size(): number { return this.current.length }
  async load(): Promise<PalimpsestEvent[]> { return this.current }
  async save(): Promise<void> { throw new ConcurrentModificationError() }
}

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

// ── Shared agenda-mapping fixtures ────────────────────────────────────────────

const AGENDA_SPHERE_ID = 'sph2' as SphereId
const stateWithAgendas = {
  ...createEmptyState(),
  ...buildStateFromConfig([{
    id: AGENDA_SPHERE_ID,
    name: 'Work',
    agendas: [{ id: 'agenda-jim' as AgendaId, title: 'Jim' }, { id: 'agenda-han' as AgendaId, title: 'Han' }],
    contexts: [],
  }]),
}

function makeMapTask(mapping: Record<string, string>, overrides: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'maptask1',
    content: AGENDA_PROJECT_MAP_TASK_TITLE,
    description: serializeAgendaMapping(mapping),
    project_id: TODOIST_INBOX_ID,
    labels: [],
    priority: 1,
    due: null,
    checked: false,
    is_deleted: false,
    added_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

function makeSyncProject(id: string, overrides: Partial<api.SyncProject> = {}): api.SyncProject {
  return {
    id, name: id, description: '', parent_id: TODOIST_WORK_PROJECT_ID,
    is_inbox_project: false, is_archived: false, is_deleted: false,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
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

  describe('pending event store concurrency', () => {
    it('only removes the events it actually sent, not ones another tab appended mid-flight', async () => {
      const initialEv = makeTaskEvent()
      const pending = new SpyPendingStore([initialEv])
      const concurrentEv = makeTaskEvent()
      vi.mocked(api.sync).mockImplementation(async () => {
        // Simulate a second tab appending a new local event while this tab's network
        // round trip is in flight — i.e. after this sync already read the pending list to send.
        await pending.save([...(await pending.load()), concurrentEv])
        return { ...EMPTY_SYNC }
      })
      const store = new TodoistStore('fake-token', { initialState: baseState, pendingStore: pending })
      await store.refresh()

      const stillPending = await pending.load()
      expect(stillPending.map(e => e.id)).toEqual([concurrentEv.id])
    })

    it('surfaces post-sync cleanup exhausting its retries as a sync error instead of throwing out of refresh()', async () => {
      vi.mocked(api.sync).mockResolvedValue({ ...EMPTY_SYNC })
      const pending = new AlwaysConflictingPendingStore([makeTaskEvent()])
      const store = new TodoistStore('fake-token', { initialState: baseState, pendingStore: pending })

      await expect(store.refresh()).resolves.toBeUndefined()

      expect(store.syncState.health).toBe('error')
      expect(store.syncState.lastError).toBeDefined()
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

  describe('shared agenda-mapping storage task', () => {
    it('reflects a project agendaId learned from the shared storage task after a full sync', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1')],
        items: [makeMapTask({ p1: 'jim' })],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()
      const state = await store.getState()
      expect(state.projects.get('p1' as ProjectId)?.agendaId).toBe('agenda-jim')
    })

    it('retains the agenda link across a later delta sync that does not mention the map task', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1')],
        items: [makeMapTask({ p1: 'jim' })],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()

      vi.mocked(api.sync).mockResolvedValueOnce({ sync_token: 'tok3', full_sync: false, projects: [], items: [] })
      await store.refresh()

      const state = await store.getState()
      expect(state.projects.get('p1' as ProjectId)?.agendaId).toBe('agenda-jim')
    })

    it('writes a new agenda link via item_update against the map task learned from a previous sync, preserving other entries', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1'), makeSyncProject('p2')],
        items: [makeMapTask({ p1: 'jim' }, { id: 'realMapTaskId' })],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()

      await store.appendEvents([{
        id: 'ev1' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
        projectId: 'p2' as ProjectId, patch: { agendaId: 'agenda-han' as AgendaId },
      }])

      vi.mocked(api.sync).mockResolvedValueOnce({ sync_token: 'tok3', full_sync: false, projects: [], items: [] })
      await store.refresh()

      const secondCallArgs = vi.mocked(api.sync).mock.calls[1]
      const sentCommands = secondCallArgs?.[1]?.commands ?? []
      const update = sentCommands.find(c => c.type === 'item_update' && c.args.id === 'realMapTaskId')
      expect(update).toBeDefined()
      const description = update?.args.description as string
      expect(description).toContain('"p1": "jim"')
      expect(description).toContain('"p2": "han"')
    })

    it('both agenda-link changes in the same flush end up in the final blob, not just the last one', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1'), makeSyncProject('p2')],
        items: [],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()

      await store.appendEvents([
        {
          id: 'ev1' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p1' as ProjectId, patch: { agendaId: 'agenda-jim' as AgendaId },
        },
        {
          id: 'ev2' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p2' as ProjectId, patch: { agendaId: 'agenda-han' as AgendaId },
        },
      ])

      vi.mocked(api.sync).mockResolvedValueOnce({ sync_token: 'tok3', full_sync: false, projects: [], items: [] })
      await store.refresh()

      const secondCallArgs = vi.mocked(api.sync).mock.calls[1]
      const sentCommands = secondCallArgs?.[1]?.commands ?? []
      const mappingCommands = sentCommands.filter(c =>
        (c.type === 'item_add' && c.args.content === AGENDA_PROJECT_MAP_TASK_TITLE) || c.type === 'item_update')
      // Exactly one command, not two: the second event's change is folded into the first
      // event's still-unsent item_add rather than emitted as a separate item_update whose `id`
      // would reference that item_add's temp_id — see the "client offline, batches up several
      // changes" tests below for why relying on the Sync API resolving a temp_id inside a
      // second command's `id` argument (rather than just a reference field like project_id) is
      // avoided rather than assumed.
      expect(mappingCommands).toHaveLength(1)
      const description = mappingCommands[0]?.args.description as string
      expect(description).toContain('"p1": "jim"')
      expect(description).toContain('"p2": "han"')
    })

    it('offline client batches three agenda-link changes to different projects before any map task exists: all fold into a single item_add', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1'), makeSyncProject('p2'), makeSyncProject('p3')],
        items: [],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()

      await store.appendEvents([
        {
          id: 'ev1' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p1' as ProjectId, patch: { agendaId: 'agenda-jim' as AgendaId },
        },
        {
          id: 'ev2' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p2' as ProjectId, patch: { agendaId: 'agenda-han' as AgendaId },
        },
        {
          id: 'ev3' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p3' as ProjectId, patch: { agendaId: 'agenda-jim' as AgendaId },
        },
      ])

      vi.mocked(api.sync).mockResolvedValueOnce({ sync_token: 'tok3', full_sync: false, projects: [], items: [] })
      await store.refresh()

      const sentCommands = vi.mocked(api.sync).mock.calls[1]?.[1]?.commands ?? []
      const mappingCommands = sentCommands.filter(c =>
        (c.type === 'item_add' && c.args.content === AGENDA_PROJECT_MAP_TASK_TITLE) || c.type === 'item_update')
      expect(mappingCommands).toHaveLength(1)
      expect(mappingCommands[0]?.type).toBe('item_add')
      const description = mappingCommands[0]?.args.description as string
      expect(description).toContain('"p1": "jim"')
      expect(description).toContain('"p2": "han"')
      expect(description).toContain('"p3": "jim"')
    })

    it('offline client batches two agenda-link changes to the SAME project before any map task exists: only the final value is sent, via a single item_add', async () => {
      vi.mocked(api.sync).mockResolvedValueOnce({
        sync_token: 'tok2', full_sync: true,
        projects: [makeSyncProject('p1')],
        items: [],
      })
      const store = makeStore(stateWithAgendas)
      await store.refresh()

      await store.appendEvents([
        {
          id: 'ev1' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p1' as ProjectId, patch: { agendaId: 'agenda-jim' as AgendaId },
        },
        {
          id: 'ev2' as EventId, type: 'project.updated', occurredAt: new Date().toISOString(),
          projectId: 'p1' as ProjectId, patch: { agendaId: 'agenda-han' as AgendaId },
        },
      ])

      vi.mocked(api.sync).mockResolvedValueOnce({ sync_token: 'tok3', full_sync: false, projects: [], items: [] })
      await store.refresh()

      const sentCommands = vi.mocked(api.sync).mock.calls[1]?.[1]?.commands ?? []
      const mappingCommands = sentCommands.filter(c =>
        (c.type === 'item_add' && c.args.content === AGENDA_PROJECT_MAP_TASK_TITLE) || c.type === 'item_update')
      expect(mappingCommands).toHaveLength(1)
      expect(mappingCommands[0]?.type).toBe('item_add')
      const description = mappingCommands[0]?.args.description as string
      expect(description).toContain('"p1": "han"')
      expect(description).not.toContain('jim')
    })
  })
})
