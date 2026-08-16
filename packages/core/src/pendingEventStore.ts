import type { PalimpsestEvent } from './events'

export interface PendingEventStore {
  readonly size: number
  // A stable identifier for the underlying storage location (e.g. the localStorage key),
  // when the implementation has one. Lets callers like PollingStore's 'storage' listener
  // tell whether a given change notification is actually about this store. Undefined means
  // "no such notion" (e.g. MemoryPendingEventStore) — callers should treat that as "always relevant".
  readonly key?: string
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

// Queues concurrent updatePending() calls against the SAME store instance so their
// read-modify-write cycles never interleave. Implementations like LocalStoragePendingEventStore
// detect a concurrent writer by comparing against a single "last observed" value tracked on the
// instance itself — two overlapping cycles on that one instance (e.g. two appendEvents() calls
// fired without awaiting each other, within the same tab) would otherwise each pass that check
// against the other's write and clobber it, exactly like two separate tabs can.
const activeUpdatePending = new WeakMap<PendingEventStore, Promise<void>>()

// Read-modify-write against a PendingEventStore. Retries compute() against a fresh
// load() whenever save() reports a ConcurrentModificationError, so a concurrent writer
// (e.g. another browser tab sharing the same localStorage key) never gets silently
// overwritten.
export async function updatePending(
  store: PendingEventStore,
  compute: (current: PalimpsestEvent[]) => PalimpsestEvent[],
): Promise<void> {
  const queued = (activeUpdatePending.get(store) ?? Promise.resolve())
    .catch(() => {})
    .then(() => updatePendingOnce(store, compute))
  activeUpdatePending.set(store, queued)
  return queued
}

async function updatePendingOnce(
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

// Removes exactly the given events (by id) from a PendingEventStore, via updatePending —
// not a blind save([]) — so an event a concurrent writer appended while these were in flight
// (e.g. another tab, mid-network-round-trip) survives instead of being wiped out along with them.
export async function removeSentEvents(
  store: PendingEventStore,
  sent: readonly PalimpsestEvent[],
): Promise<void> {
  if (sent.length === 0) return
  const sentIds = new Set(sent.map(e => e.id))
  await updatePending(store, current => current.filter(e => !sentIds.has(e.id)))
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
