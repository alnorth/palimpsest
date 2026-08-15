import { PollingStore, updatePending } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState, PendingEventStore } from '@alnorth/palimpsest'

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

  override async readAllEvents(): Promise<PalimpsestEvent[]> {
    return [...this.baseEvents, ...await this.pendingStore.load()]
  }

  override async sync(): Promise<void> {
    const unsyncedEvents = await this.pendingStore.load()
    let response: SyncResponse
    try {
      response = await this.syncFn(this.baseSeq, unsyncedEvents)
    } catch (err) {
      this.health = 'error'
      this.syncError = err instanceof Error ? err.message : String(err)
      return
    }

    const hadUnsynced = unsyncedEvents.length > 0

    if (response.missedEvents.length > 0) {
      this.baseEvents = [...this.baseEvents, ...response.missedEvents]
    }

    if (response.status === 'ok') {
      this.baseSeq = response.serverSeq
      if (hadUnsynced) {
        this.baseEvents = [...this.baseEvents, ...unsyncedEvents]
        // Remove only the events this sync actually sent, by id — not a blind save([]) —
        // so an event another tab appended while this network round trip was in flight
        // survives to be picked up by the next sync instead of being silently dropped.
        const sentIds = new Set(unsyncedEvents.map(e => e.id))
        await updatePending(this.pendingStore, current => current.filter(e => !sentIds.has(e.id)))
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
  }
}
