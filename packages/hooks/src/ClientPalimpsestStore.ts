import { PollingStore, removeSentEvents } from '@alnorth/palimpsest'
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
        try {
          await removeSentEvents(this.pendingStore, unsyncedEvents)
        } catch (err) {
          // Retries against a concurrent writer (e.g. another tab appending nonstop) were
          // exhausted. The server already accepted these events, but we can't safely confirm
          // what got cleared locally, so report this the same way as a network failure rather
          // than throwing out of sync() — and leave baseEvents untouched, since the still-present
          // pendingStore entries already account for them in readAllEvents() until the next
          // successful cleanup folds them in here.
          this.health = 'error'
          this.syncError = err instanceof Error ? err.message : String(err)
          return
        }
        this.baseEvents = [...this.baseEvents, ...unsyncedEvents]
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
