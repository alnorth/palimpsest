import { PollingStore } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, PendingEventStore } from 'palimpsest'

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

export class ClientPalimpsestStore extends PollingStore {
  private baseEvents: PalimpsestEvent[] = []
  private baseSeq = 0

  private health: SyncHealth = 'idle'
  private conflicts: PendingConflict[] = []
  private syncError: string | undefined

  get syncState(): SyncState {
    return {
      health: this.health,
      unsyncedCount: this.pendingStore.size,
      pendingConflicts: this.conflicts,
      lastError: this.syncError,
    }
  }

  constructor(
    private readonly syncFn: SyncFn,
    opts: { syncIntervalMs?: number; pendingStore?: PendingEventStore; initialState?: ProjectionState } = {},
  ) {
    super(opts)
  }

  override async init(): Promise<void> {
    const response = await this.sync()
    if (response === undefined) {
      throw new Error(this.syncError ?? 'Connection failed')
    }
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    return [...this.baseEvents, ...await this.pendingStore.load()]
  }

  protected override async doRefresh(): Promise<void> {
    await this.sync()
  }

  async sync(): Promise<SyncResponse | undefined> {
    const unsyncedEvents = await this.pendingStore.load()
    let response: SyncResponse
    try {
      response = await this.syncFn(this.baseSeq, unsyncedEvents)
    } catch (err) {
      const prevHealth = this.health
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      if (this.health !== prevHealth) this.notify()
      else this.notify()
      return undefined
    }

    const hadMissed = response.missedEvents.length > 0
    const hadUnsynced = unsyncedEvents.length > 0

    if (response.missedEvents.length > 0) {
      this.baseEvents = [...this.baseEvents, ...response.missedEvents]
    }

    const prevHealth = this.health

    if (response.status === 'ok') {
      this.baseSeq = response.serverSeq
      if (hadUnsynced) {
        this.baseEvents = [...this.baseEvents, ...unsyncedEvents]
        await this.pendingStore.save([])
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
}
