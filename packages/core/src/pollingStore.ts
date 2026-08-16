import { PalimpsestStore } from './store'
import { MemoryPendingEventStore, updatePending } from './pendingEventStore'
import type { PendingEventStore } from './pendingEventStore'
import type { PalimpsestEvent } from './events'
import type { ProjectionState } from './projection'

function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

function getWin(): { addEventListener: Function; removeEventListener: Function } | undefined {
  return typeof (globalThis as any).window !== 'undefined' ? (globalThis as any).window : undefined
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
    await updatePending(this.pendingStore, current => [...current, ...events])
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
    getWin()?.addEventListener('storage', this.onStorageEvent)
  }

  override stop(): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    getDoc()?.removeEventListener('visibilitychange', this.onVisibilityChange)
    getWin()?.removeEventListener('storage', this.onStorageEvent)
  }

  private readonly onVisibilityChange = (): void => {
    if (getDoc()?.visibilityState === 'visible') void this.refresh()
  }

  // Another same-origin tab wrote to localStorage (e.g. appended a pending event via
  // LocalStoragePendingEventStore). Re-project from the now-updated pendingStore instead
  // of waiting for the next poll tick or visibility change. Only reacts to a change on our
  // own pendingStore's key (when it exposes one) — otherwise an unrelated same-origin write
  // (another library's key, a different store's key) would trigger a needless re-projection.
  private readonly onStorageEvent = (event?: { key?: string | null }): void => {
    const pendingKey = this.pendingStore.key
    const eventKey = event?.key
    if (pendingKey !== undefined && eventKey !== undefined && eventKey !== null && eventKey !== pendingKey) {
      return
    }
    this.notify()
  }
}
