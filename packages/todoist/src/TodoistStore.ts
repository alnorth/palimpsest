import { PalimpsestStore, applyEvent, createEmptyState } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, TaskId, ProjectId } from 'palimpsest'
import { syncRead, syncWrite } from './api.js'
import type { SyncCommand } from './api.js'
import { buildState, applyDelta } from './read.js'
import { buildCommands } from './write.js'

function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export class TodoistStore extends PalimpsestStore {
  private currentState: ProjectionState = createEmptyState()
  private syncToken = '*'
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private readonly syncIntervalMs: number

  constructor(
    private readonly token: string,
    opts: { syncIntervalMs?: number } = {},
  ) {
    super()
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
  }

  override async init(): Promise<void> {
    const now = new Date().toISOString()
    const res = await syncRead(this.token, '*')
    this.syncToken = res.sync_token
    this.currentState = buildState(res.projects, res.items, now)
  }

  override readAllEvents(): Promise<PalimpsestEvent[]> {
    return Promise.resolve([])
  }

  override async getState(): Promise<ProjectionState> {
    return this.currentState
  }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    const allCommands: SyncCommand[] = []
    // tempId → nanoid (source id from the event) for later substitution
    const tempToSourceId = new Map<string, string>()
    // nanoid → temp_id, built during the first pass so that cross-batch foreign-key
    // references (e.g. task.created pointing at a project created earlier in the same
    // batch) use the temp_id that Todoist resolves within the batch, not the nanoid.
    const nanoidToTempId = new Map<string, string>()
    // nanoid → todoistId substitutions discovered after the write
    const subs = new Map<string, string>()

    // First pass: build commands, substituting nanoids with temp_ids for cross-references
    for (const raw of events) {
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

    // Send all commands in one batch
    if (allCommands.length > 0) {
      const res = await syncWrite(this.token, allCommands)
      // Build nanoid → todoistId substitution map from temp_id_mapping
      for (const [tempId, todoistId] of Object.entries(res.temp_id_mapping)) {
        const sourceId = tempToSourceId.get(tempId)
        if (sourceId !== undefined) subs.set(sourceId, todoistId)
      }
    }

    // Second pass: apply events to local state with resolved IDs
    for (const raw of events) {
      const event = applySourceIdSubs(raw, subs)
      const sub = getCreatedEntitySub(event, subs)
      if (sub !== undefined) {
        applyEvent(this.currentState, substituteCreatedId(event, sub))
      } else {
        applyEvent(this.currentState, event)
      }
    }
  }

  async refresh(): Promise<void> {
    const now = new Date().toISOString()
    const res = await syncRead(this.token, this.syncToken)
    this.syncToken = res.sync_token

    if (res.full_sync) {
      this.currentState = buildState(res.projects, res.items, now)
    } else {
      applyDelta(this.currentState, res.projects, res.items, now)
    }
    this.notify()
  }

  override start(): void {
    this.pollTimer = setInterval(() => { void this.refresh() }, this.syncIntervalMs)
    getDoc()?.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  override stop(): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    getDoc()?.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  private readonly onVisibilityChange = (): void => {
    if (getDoc()?.visibilityState === 'visible') void this.refresh()
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
