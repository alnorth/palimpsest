import { PollingStore, applyEvent, createEmptyState, project } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, TaskId, ProjectId, PendingEventStore } from 'palimpsest'
import { syncRead, syncWrite } from './api.js'
import type { SyncCommand } from './api.js'
import { buildState, applyDelta } from './read.js'
import { buildCommands } from './write.js'

export class TodoistStore extends PollingStore {
  private currentState: ProjectionState
  private readonly configState: ProjectionState
  private syncToken = '*'

  constructor(
    private readonly token: string,
    opts: { syncIntervalMs?: number; pendingStore?: PendingEventStore; configState?: ProjectionState } = {},
  ) {
    super(opts)
    this.configState = opts.configState ?? createEmptyState()
    this.currentState = this.configState
  }

  override readAllEvents(): Promise<PalimpsestEvent[]> {
    throw new Error('TodoistStore does not support readAllEvents')
  }

  override async getState(): Promise<ProjectionState> {
    return project(await this.pendingStore.load(), this.currentState)
  }

  override async sync(): Promise<void> {
    const pending = await this.pendingStore.load()

    if (pending.length > 0) {
      const allCommands: SyncCommand[] = []
      // tempId → nanoid (source id from the event) for later substitution
      const tempToSourceId = new Map<string, string>()
      // nanoid → temp_id, built during the first pass so that cross-batch foreign-key
      // references (e.g. task.created pointing at a project created earlier in the same
      // batch) use the temp_id that Todoist resolves within the batch, not the nanoid.
      const nanoidToTempId = new Map<string, string>()
      // nanoid → todoistId substitutions discovered after the write
      const subs = new Map<string, string>()

      for (const raw of pending) {
        const event = applySourceIdSubs(raw, nanoidToTempId)
        const { commands, tempId } = buildCommands(event, this.currentState)
        allCommands.push(...commands)
        if (tempId !== undefined) {
          const sourceId = event.type === 'task.created'    ? String(event.taskId)
                         : event.type === 'project.created' ? String(event.projectId)
                         : undefined
          if (sourceId !== undefined) {
            tempToSourceId.set(tempId, sourceId)
            nanoidToTempId.set(sourceId, tempId)
          }
        }
      }

      if (allCommands.length > 0) {
        let writeRes
        try {
          writeRes = await syncWrite(this.token, allCommands)
        } catch (err) {
          this.health = 'error'
          this.syncError = err instanceof Error ? err.message : String(err)
          return
        }
        for (const [tempId, todoistId] of Object.entries(writeRes.temp_id_mapping)) {
          const sourceId = tempToSourceId.get(tempId)
          if (sourceId !== undefined) subs.set(sourceId, todoistId)
        }
      }

      for (const raw of pending) {
        const event = applySourceIdSubs(raw, subs)
        const sub = getCreatedEntitySub(event, subs)
        if (sub !== undefined) {
          applyEvent(this.currentState, substituteCreatedId(event, sub))
        } else {
          applyEvent(this.currentState, event)
        }
      }
      await this.pendingStore.save([])
    }

    let readRes
    try {
      readRes = await syncRead(this.token, this.syncToken)
    } catch (err) {
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return
    }
    this.syncToken = readRes.sync_token
    if (readRes.full_sync) {
      this.currentState = buildState(readRes.projects, readRes.items, this.configState)
    } else {
      applyDelta(this.currentState, readRes.projects, readRes.items)
    }
    this.health = 'idle'
    this.syncError = undefined
  }

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

function getCreatedEntitySub(event: PalimpsestEvent, subs: Map<string, string>): string | undefined {
  if (event.type === 'task.created')    return subs.get(String(event.taskId))
  if (event.type === 'project.created') return subs.get(String(event.projectId))
  return undefined
}

function substituteCreatedId(event: PalimpsestEvent, todoistId: string): PalimpsestEvent {
  if (event.type === 'task.created')    return { ...event, taskId:    todoistId as TaskId }
  if (event.type === 'project.created') return { ...event, projectId: todoistId as ProjectId }
  return event
}
