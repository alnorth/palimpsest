import { PalimpsestStore } from './store.js'
import { MemoryPendingEventStore } from './pendingEventStore.js'
import type { PendingEventStore } from './pendingEventStore.js'
import type { ProjectionState } from './projection.js'

function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export abstract class PollingStore extends PalimpsestStore {
  protected readonly pendingStore: PendingEventStore
  protected readonly syncIntervalMs: number
  private pollTimer: ReturnType<typeof setInterval> | undefined

  protected constructor(
    opts: { pendingStore?: PendingEventStore; syncIntervalMs?: number; initialState?: ProjectionState } = {},
  ) {
    super(opts.initialState)
    this.pendingStore = opts.pendingStore ?? new MemoryPendingEventStore()
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
  }

  abstract refresh(): Promise<void>

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
