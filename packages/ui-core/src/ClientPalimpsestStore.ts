import { PalimpsestStore, MemoryPendingEventStore } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, PendingEventStore } from 'palimpsest'

// Access document without requiring DOM lib — safe to call in Node.js environments
function getDoc(): { addEventListener: Function; removeEventListener: Function; visibilityState: string } | undefined {
  return typeof (globalThis as any).document !== 'undefined' ? (globalThis as any).document : undefined
}

export type SyncStatus = 'ok' | 'conflict' | 'rerun'
export type SyncHealth = 'idle' | 'error' | 'conflict'

export interface SyncResponse {
  status: SyncStatus
  serverSeq: number
  missedEvents: PalimpsestEvent[]
  reason?: string
  conflictingEvents?: PalimpsestEvent[]
}

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

export type SyncFn = (clientSeq: number, events: PalimpsestEvent[]) => Promise<SyncResponse>

export class ClientPalimpsestStore extends PalimpsestStore {
  private baseEvents: PalimpsestEvent[] = []
  private baseSeq = 0
  private unsyncedEvents: PalimpsestEvent[] = []
  private syncTimer: ReturnType<typeof setInterval> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private readonly syncIntervalMs: number
  private readonly pendingStore: PendingEventStore

  private health: SyncHealth = 'idle'
  private conflicts: PendingConflict[] = []
  private syncError: string | undefined

  get syncState(): SyncState {
    return {
      health: this.health,
      unsyncedCount: this.unsyncedEvents.length,
      pendingConflicts: this.conflicts,
      lastError: this.syncError,
    }
  }

  constructor(
    private readonly syncFn: SyncFn,
    opts: { syncIntervalMs?: number; pendingStore?: PendingEventStore; initialState?: ProjectionState } = {},
  ) {
    super(opts.initialState)
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
    this.pendingStore = opts.pendingStore ?? new MemoryPendingEventStore()
  }

  override async init(): Promise<void> {
    this.unsyncedEvents = await this.pendingStore.load()
    await this.sync()
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    return [...this.baseEvents, ...this.unsyncedEvents]
  }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    this.unsyncedEvents = [...this.unsyncedEvents, ...events]
    void this.pendingStore.save(this.unsyncedEvents)
    this.scheduleSync()
  }

  async sync(): Promise<SyncResponse | undefined> {
    let response: SyncResponse
    try {
      response = await this.syncFn(this.baseSeq, this.unsyncedEvents)
    } catch (err) {
      const prevHealth = this.health
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      if (this.health !== prevHealth) this.notify()
      else this.notify()
      return undefined
    }

    const hadMissed = response.missedEvents.length > 0
    const hadUnsynced = this.unsyncedEvents.length > 0

    if (response.missedEvents.length > 0) {
      this.baseEvents = [...this.baseEvents, ...response.missedEvents]
    }

    const prevHealth = this.health

    if (response.status === 'ok') {
      this.baseSeq = response.serverSeq
      if (hadUnsynced) {
        this.baseEvents = [...this.baseEvents, ...this.unsyncedEvents]
        this.unsyncedEvents = []
        void this.pendingStore.save(this.unsyncedEvents)
      }
      this.health = 'idle'
      this.conflicts = []
      this.syncError = undefined
    } else if (response.status === 'conflict') {
      this.health = 'conflict'
      this.conflicts = [{
        reason: response.reason ?? 'conflict',
        conflictingEvents: response.conflictingEvents ?? [],
      }]
    }

    const healthChanged = this.health !== prevHealth
    if (hadMissed || (hadUnsynced && response.status === 'ok') || healthChanged) {
      this.notify()
    }

    return response
  }

  override start(): void {
    this.syncTimer = setInterval(() => { void this.sync() }, this.syncIntervalMs)
    getDoc()?.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  override stop(): void {
    if (this.syncTimer !== undefined) clearInterval(this.syncTimer)
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    getDoc()?.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  private readonly onVisibilityChange = (): void => {
    if (getDoc()?.visibilityState === 'visible') void this.sync()
  }

  private scheduleSync(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => { void this.sync() }, 500)
  }
}
