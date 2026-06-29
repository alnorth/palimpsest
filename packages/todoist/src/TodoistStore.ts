import { PalimpsestStore, applyEvent, createEmptyState } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState } from 'palimpsest'
import { fetchState } from './read.js'
import { applyEventToTodoist, substituteCreatedId, applyIdSubstitutions } from './write.js'

// Access document without requiring DOM lib — safe in Node.js environments too
function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export class TodoistStore extends PalimpsestStore {
  private currentState: ProjectionState = createEmptyState()
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
    this.currentState = await fetchState(this.token)
  }

  override readAllEvents(): Promise<PalimpsestEvent[]> {
    return Promise.resolve([])
  }

  override async getState(): Promise<ProjectionState> {
    return this.currentState
  }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    // Track nanoid → todoistId substitutions for entities created in this batch
    const subs = new Map<string, string>()

    for (const raw of events) {
      const event = applyIdSubstitutions(raw, subs)
      const todoistId = await applyEventToTodoist(event, this.currentState, this.token)

      if (todoistId !== undefined) {
        const sourceId = event.type === 'task.created' ? event.taskId : event.type === 'project.created' ? event.projectId : undefined
        if (sourceId !== undefined) subs.set(sourceId, todoistId)
        applyEvent(this.currentState, substituteCreatedId(event, todoistId))
      } else {
        applyEvent(this.currentState, event)
      }
    }
  }

  async refresh(): Promise<void> {
    this.currentState = await fetchState(this.token)
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
