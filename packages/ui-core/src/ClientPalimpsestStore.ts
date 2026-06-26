import { PalimpsestStore } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState } from 'palimpsest'
import { MemoryPendingEventStore } from './PendingEventStore.js'
import type { PendingEventStore } from './PendingEventStore.js'

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

export type SyncFn = (clientSeq: number, events: PalimpsestEvent[]) => Promise<SyncResponse>

export class ClientPalimpsestStore extends PalimpsestStore {
  private baseEvents: PalimpsestEvent[] = []
  private baseSeq = 0
  private unsyncedEvents: PalimpsestEvent[] = []
  private listeners = new Set<() => void>()
  private syncTimer: ReturnType<typeof setInterval> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private readonly syncIntervalMs: number
  private readonly pendingStore: PendingEventStore

  private health: SyncHealth = 'idle'
  private conflicts: PendingConflict[] = []
  private syncError: string | undefined

  // Resolves after the first sync attempt (success or failure) so that
  // readAllEvents() never returns a partial list.
  private syncReady: Promise<void>
  private resolveSyncReady!: () => void

  get syncHealth(): SyncHealth { return this.health }
  get pendingConflicts(): PendingConflict[] { return this.conflicts }
  get lastSyncError(): string | undefined { return this.syncError }

  constructor(
    private readonly syncFn: SyncFn,
    opts: { syncIntervalMs?: number; pendingStore?: PendingEventStore; initialState?: ProjectionState } = {},
  ) {
    super(opts.initialState)
    this.syncIntervalMs = opts.syncIntervalMs ?? 30_000
    this.pendingStore = opts.pendingStore ?? new MemoryPendingEventStore()
    this.syncReady = new Promise(resolve => { this.resolveSyncReady = resolve })
  }

  get unsyncedCount(): number {
    return this.unsyncedEvents.length
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  async init(): Promise<void> {
    this.unsyncedEvents = await this.pendingStore.load()
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    await this.syncReady
    return [...this.baseEvents, ...this.unsyncedEvents]
  }

  override async appendEvents(events: PalimpsestEvent[]): Promise<void> {
    if (events.length === 0) return
    this.unsyncedEvents = [...this.unsyncedEvents, ...events]
    void this.pendingStore.save(this.unsyncedEvents)
    this.notify()
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
      this.resolveSyncReady()
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

    this.resolveSyncReady()

    const healthChanged = this.health !== prevHealth
    if (hadMissed || (hadUnsynced && response.status === 'ok') || healthChanged) {
      this.notify()
    }

    return response
  }

  start(): void {
    void this.init().then(() => this.sync())
    this.syncTimer = setInterval(() => { void this.sync() }, this.syncIntervalMs)
    getDoc()?.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  stop(): void {
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
