import { PollingStore, project, createEmptyState, removeSentEvents } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState, ProjectId, PendingEventStore } from '@alnorth/palimpsest'
import { sync } from './api'
import type { SyncCommand } from './api'
import { buildEvents, buildDeltaEvents } from './read'
import { buildCommands } from './write'

export class TodoistStore extends PollingStore {
  private baseEvents: PalimpsestEvent[] = []
  private readonly configState: ProjectionState

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
      allCommands = buildAllCommands(pending, this.baseEvents, this.configState)
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
): SyncCommand[] {
  if (pending.length === 0) return []

  const currentState = project(baseEvents, configState)
  // nanoid → temp_id so that cross-batch foreign-key references (e.g. task.created
  // pointing at a project created earlier in the same batch) use the temp_id that
  // Todoist resolves within the batch, not the nanoid.
  const nanoidToTempId = new Map<string, string>()
  const allCommands: SyncCommand[] = []

  for (const raw of pending) {
    const event = applySourceIdSubs(raw, nanoidToTempId)
    const { commands, tempId } = buildCommands(event, currentState)
    allCommands.push(...commands)
    if (tempId !== undefined) {
      const sourceId = event.type === 'task.created'    ? String(event.taskId)
                     : event.type === 'project.created' ? String(event.projectId)
                     : undefined
      if (sourceId !== undefined) {
        nanoidToTempId.set(sourceId, tempId)
      }
    }
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
