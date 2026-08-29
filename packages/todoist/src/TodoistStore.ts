import { PollingStore, project, applyEvent, createEmptyState, removeSentEvents } from '@alnorth/palimpsest'
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

    try {
      await removeSentEvents(this.pendingStore, pending)
    } catch (err) {
      // Retries against a concurrent writer (e.g. another tab appending nonstop) were
      // exhausted. The POST above already succeeded, but we can't safely confirm what got
      // cleared locally, so report this the same way as a network failure rather than
      // throwing out of sync() — the still-present pending events get resent next attempt.
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return
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
  // start-of-flush snapshot.
  let runningAgendaMapping = rawAgendaMapping
  let runningAgendaMapTaskId = agendaMapTaskId
  // The item_add command for the shared agenda-mapping task, if it was created earlier in this
  // same batch and hasn't been sent to Todoist yet. A later event in the same batch that also
  // touches the mapping mutates this command's description directly instead of pushing a second
  // item_update whose `id` argument would reference this item_add's temp_id — unlike a
  // reference field (e.g. project_id, which Todoist documents resolving against temp_id_mapping
  // within a batch), relying on temp_id substitution inside another command's `id` argument
  // isn't something this codebase has verified against the real Sync API, so it's avoided here
  // rather than assumed.
  let pendingAgendaMapTaskAdd: SyncCommand | undefined

  for (const raw of pending) {
    const event = applySourceIdSubs(raw, nanoidToTempId)
    const { commands, tempId, agendaMappingAfter, agendaMapTaskTempId } = buildCommands(event, currentState, {
      rawAgendaMapping: runningAgendaMapping,
      ...(runningAgendaMapTaskId !== undefined && { agendaMapTaskId: runningAgendaMapTaskId }),
    })

    for (const command of commands) {
      if (
        pendingAgendaMapTaskAdd !== undefined &&
        command.type === 'item_update' &&
        command.args['id'] === pendingAgendaMapTaskAdd.temp_id
      ) {
        pendingAgendaMapTaskAdd.args['description'] = command.args['description']
        continue
      }
      allCommands.push(command)
    }

    if (tempId !== undefined) {
      const sourceId = event.type === 'task.created'    ? String(event.taskId)
                     : event.type === 'project.created' ? String(event.projectId)
                     : undefined
      if (sourceId !== undefined) {
        nanoidToTempId.set(sourceId, tempId)
      }
    }
    if (agendaMappingAfter !== undefined) runningAgendaMapping = agendaMappingAfter
    if (agendaMapTaskTempId !== undefined) {
      runningAgendaMapTaskId = agendaMapTaskTempId
      pendingAgendaMapTaskAdd = commands.find(c => c.type === 'item_add' && c.temp_id === agendaMapTaskTempId)
    }

    // buildCommands's task.updated case diffs against `currentState`, so two task.updated events
    // for the same task in this same flush must not both diff against the same pre-batch task —
    // the second one would see the first one's changes as if they'd never happened (e.g. set a
    // due date then clear it again, all before any sync: the second event's "before" would still
    // show no due date, so the clear looks like a no-op and never reaches Todoist even though the
    // first event's due-date-set command already did). Folding raw (pre-temp_id-substitution:
    // currentState is keyed by the same nanoid ids pending events reference, not the Sync API
    // temp_ids applySourceIdSubs produces for cross-referencing) events into currentState as
    // they're processed keeps every event in the batch diffing against the batch's running state
    // rather than its start-of-flush snapshot.
    if (raw.type === 'task.updated') applyEvent(currentState, raw)
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
