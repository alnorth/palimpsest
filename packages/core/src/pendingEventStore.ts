import type { PalimpsestEvent } from './events'

export interface PendingEventStore {
  readonly size: number
  load(): Promise<PalimpsestEvent[]>
  // Implementations that can detect a concurrent writer (e.g. another browser tab)
  // MUST throw ConcurrentModificationError instead of clobbering it; use updatePending
  // as a caller rather than calling save() directly after a load().
  save(unsyncedEvents: PalimpsestEvent[]): Promise<void>
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super('Pending event store was modified by another writer since it was last loaded')
    this.name = 'ConcurrentModificationError'
  }
}

const MAX_RETRY_ATTEMPTS = 5

// Read-modify-write against a PendingEventStore. Retries compute() against a fresh
// load() whenever save() reports a ConcurrentModificationError, so a concurrent writer
// (e.g. another browser tab sharing the same localStorage key) never gets silently
// overwritten.
export async function updatePending(
  store: PendingEventStore,
  compute: (current: PalimpsestEvent[]) => PalimpsestEvent[],
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const current = await store.load()
    try {
      await store.save(compute(current))
      return
    } catch (err) {
      if (!(err instanceof ConcurrentModificationError)) throw err
    }
  }
  throw new ConcurrentModificationError()
}

export class MemoryPendingEventStore implements PendingEventStore {
  private events: PalimpsestEvent[] = []

  get size(): number { return this.events.length }

  async load(): Promise<PalimpsestEvent[]> {
    return this.events
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    this.events = events
  }
}
