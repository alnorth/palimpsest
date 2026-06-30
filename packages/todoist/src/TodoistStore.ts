import { PollingStore, project, createEmptyState } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, ProjectId, PendingEventStore } from 'palimpsest'
import { sync } from './api.js'
import type { SyncCommand } from './api.js'
import { buildEvents, buildDeltaEvents } from './read.js'
import { buildCommands } from './write.js'

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

    const allCommands: SyncCommand[] = []
    if (pending.length > 0) {
      const currentState = project(this.baseEvents, this.configState)
      // nanoid → temp_id so that cross-batch foreign-key references (e.g. task.created
      // pointing at a project created earlier in the same batch) use the temp_id that
      // Todoist resolves within the batch, not the nanoid.
      const nanoidToTempId = new Map<string, string>()

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
