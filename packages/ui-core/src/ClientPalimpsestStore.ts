import { PollingStore } from 'palimpsest'
import type { PalimpsestEvent, ProjectionState, PendingEventStore } from 'palimpsest'

export type SyncStatus = 'ok' | 'conflict' | 'rerun'

export interface SyncResponse {
  status: SyncStatus
  serverSeq: number
  missedEvents: PalimpsestEvent[]
  reason?: string
  conflictingEvents?: PalimpsestEvent[]
}

export type SyncFn = (clientSeq: number, events: PalimpsestEvent[]) => Promise<SyncResponse>

export class ClientPalimpsestStore extends PollingStore {
  private baseEvents: PalimpsestEvent[] = []
  private baseSeq = 0

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
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return undefined
    }

    const hadUnsynced = unsyncedEvents.length > 0

    if (response.missedEvents.length > 0) {
      this.baseEvents = [...this.baseEvents, ...response.missedEvents]
    }

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

    return response
  }
}
