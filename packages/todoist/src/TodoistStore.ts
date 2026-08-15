import { PollingStore, project, createEmptyState } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState, ProjectId, PendingEventStore } from '@alnorth/palimpsest'
import { sync } from './api'
import type { SyncCommand } from './api'
import { buildEvents, buildDeltaEvents } from './read'
import { buildCommands } from './write'
import { findAgendaMapTask, parseAgendaMapping } from './sharedStorage'

export class TodoistStore extends PollingStore {
  private baseEvents: PalimpsestEvent[] = []
  private readonly configState: ProjectionState
  // Last-known shared agenda-mapping storage task, captured from whatever sync response most
  // recently included it (full syncs always include it if it exists; delta syncs only when it
  // changed) — carried forward otherwise, mirroring how baseEvents itself accumulates.
  private rawAgendaMapping: Record<string, string> = {}
  private agendaMapTaskId: string | undefined = undefined

  constructor(
    private readonly token: string,
    opts: { syncIntervalMs?: number; pendingStore?: PendingEventStore; initialState?: ProjectionState } = {},
  ) {
    super(opts)
    this.configState = opts.initialState ?? createEmptyState()
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    const pending = await this.pendingStore.load()
    return [...this.baseEvents, ...pending]
  }

  override async sync(): Promise<void> {
    const pending = await this.pendingStore.load()

    let allCommands: SyncCommand[]
    try {
      allCommands = buildAllCommands(pending, this.baseEvents, this.configState, this.rawAgendaMapping, this.agendaMapTaskId)
    } catch (err) {
      // Without this catch, an event that fails to convert (e.g. a stale foreign-key
      // reference) throws here on every single sync attempt — poll and manual refresh alike —
      // before ever reaching the network call below, forever: `health`/`syncError` never get
      // set (that only happens in the catch below), so nothing distinguishes it from a
      // never-attempted sync, and the offending event is never dequeued to let anything past it
      // through either. Surfacing it the same way as a network failure at least makes the
      // problem visible instead of silently bricking every future sync.
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return
    }

    let res
    try {
      res = await sync(this.token, {
        syncToken: this.syncToken,
        commands: allCommands,
      })
    } catch (err) {
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return
    }

    if (pending.length > 0) {
      await this.pendingStore.save([])
    }

    const mapTask = findAgendaMapTask(res.items)
    if (mapTask !== undefined) {
      this.rawAgendaMapping = parseAgendaMapping(mapTask)
      this.agendaMapTaskId = mapTask.id
    }

    this.syncToken = res.sync_token
    if (res.full_sync) {
      this.baseEvents = buildEvents(res.projects, res.items)
    } else {
      const currentBase = project(this.baseEvents, this.configState)
      const newEvents = buildDeltaEvents(currentBase, res.projects, res.items)
      this.baseEvents.push(...newEvents)
    }
    this.health = 'idle'
    this.syncError = undefined
  }

  private syncToken = '*'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAllCommands(
  pending: PalimpsestEvent[],
  baseEvents: PalimpsestEvent[],
  configState: ProjectionState,
  rawAgendaMapping: Record<string, string>,
  agendaMapTaskId: string | undefined,
): SyncCommand[] {
  if (pending.length === 0) return []

  const currentState = project(baseEvents, configState)
  // nanoid → temp_id so that cross-batch foreign-key references (e.g. task.created
  // pointing at a project created earlier in the same batch) use the temp_id that
  // Todoist resolves within the batch, not the nanoid.
  const nanoidToTempId = new Map<string, string>()
  const allCommands: SyncCommand[] = []

  // Mutated as the batch is processed so multiple agenda-link changes in the same flush all land
  // in the final blob, instead of each one building its command against the same stale
  // start-of-flush snapshot. A brand-new map task created mid-batch is referenced by subsequent
  // commands via its temp_id — the same substitution mechanism nanoidToTempId already relies on.
  let runningAgendaMapping = rawAgendaMapping
  let runningAgendaMapTaskId = agendaMapTaskId

  for (const raw of pending) {
    const event = applySourceIdSubs(raw, nanoidToTempId)
    const { commands, tempId, agendaMappingAfter, agendaMapTaskTempId } = buildCommands(event, currentState, {
      rawAgendaMapping: runningAgendaMapping,
      ...(runningAgendaMapTaskId !== undefined && { agendaMapTaskId: runningAgendaMapTaskId }),
    })
    allCommands.push(...commands)
    if (tempId !== undefined) {
      const sourceId = event.type === 'task.created'    ? String(event.taskId)
                     : event.type === 'project.created' ? String(event.projectId)
                     : undefined
      if (sourceId !== undefined) {
        nanoidToTempId.set(sourceId, tempId)
      }
    }
    if (agendaMappingAfter !== undefined) runningAgendaMapping = agendaMappingAfter
    if (agendaMapTaskTempId !== undefined) runningAgendaMapTaskId = agendaMapTaskTempId
  }

  return allCommands
}

function applySourceIdSubs(event: PalimpsestEvent, subs: Map<string, string>): PalimpsestEvent {
  if (event.type === 'task.created' && event.projectId !== undefined) {
    const sub = subs.get(String(event.projectId))
    if (sub !== undefined) return { ...event, projectId: sub as ProjectId }
  }
  if (event.type === 'task.updated' && event.patch.projectId !== undefined && event.patch.projectId !== null) {
    const sub = subs.get(String(event.patch.projectId))
    if (sub !== undefined) return { ...event, patch: { ...event.patch, projectId: sub as ProjectId } }
  }
  return event
}
