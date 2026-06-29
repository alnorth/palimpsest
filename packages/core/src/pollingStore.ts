import { PalimpsestStore } from './store.js'
import { MemoryPendingEventStore } from './pendingEventStore.js'
import type { PendingEventStore } from './pendingEventStore.js'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'

function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export type SyncHealth = 'idle' | 'error' | 'conflict'

export interface PendingConflict {
  reason: string
  conflictingEvents: PalimpsestEvent[]
}

export interface SyncState {
  health: SyncHealth
  unsyncedCount: number
  pendingConflicts: PendingConflict[]
  lastError: string | undefined
}

export const INITIAL_SYNC_STATE: SyncState = {
  health: 'idle',
  unsyncedCount: 0,
  pendingConflicts: [],
  lastError: undefined,
}

export abstract class PollingStore extends PalimpsestStore {
  protected readonly pendingStore: PendingEventStore
  protected readonly syncIntervalMs: number
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined

  protected health: SyncHealth = 'idle'
  protected conflicts: PendingConflict[] = []
  protected syncError: string | undefined

  get syncState(): SyncState {
    return {
      health: this.health,
      unsyncedCount: this.pendingStore.size,
      pendingConflicts: this.conflicts,
      lastError: this.syncError,
    }
  }

  protected constructor(
    opts: { pendingStore?: PendingEventStore; syncIntervalMs?: number; initialState?: ProjectionState } = {},
  ) {
    super(opts.initialState)
    this.pendingStore = opts.pendingStore ?? new MemoryPendingEventStore()
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
  }

  abstract sync(): Promise<void>

  override async init(): Promise<void> {
    await this.sync()
    if (this.health === 'error') {
      throw new Error(this.syncError ?? 'Connection failed')
    }
  }

  private syncing = false

  async refresh(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      await this.sync()
    } finally {
      this.syncing = false
    }
    this.notify()
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
