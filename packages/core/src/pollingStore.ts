import { PalimpsestStore } from './store.js'
import { MemoryPendingEventStore } from './pendingEventStore.js'
import type { PendingEventStore } from './pendingEventStore.js'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'

function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export abstract class PollingStore extends PalimpsestStore {
  protected readonly pendingStore: PendingEventStore
  protected readonly syncIntervalMs: number
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined

  protected constructor(
    opts: { pendingStore?: PendingEventStore; syncIntervalMs?: number; initialState?: ProjectionState } = {},
  ) {
    super(opts.initialState)
    this.pendingStore = opts.pendingStore ?? new MemoryPendingEventStore()
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
  }

  protected abstract doRefresh(): Promise<void>

  private syncing = false

  async refresh(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      await this.doRefresh()
    } finally {
      this.syncing = false
    }
  }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    const pending = await this.pendingStore.load()
    await this.pendingStore.save([...pending, ...events])
    this.notify()
    this.scheduleSync()
  }

  protected scheduleSync(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => { void this.refresh() }, 500)
  }

  override start(): void {
    this.pollTimer = setInterval(() => { void this.refresh() }, this.syncIntervalMs)
    getDoc()?.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  override stop(): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    getDoc()?.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  private readonly onVisibilityChange = (): void => {
    if (getDoc()?.visibilityState === 'visible') void this.refresh()
  }
}
