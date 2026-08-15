import type { PalimpsestEvent } from '@alnorth/palimpsest'
import type { PendingEventStore } from '@alnorth/palimpsest'
import { ConcurrentModificationError } from '@alnorth/palimpsest'

export class LocalStoragePendingEventStore implements PendingEventStore {
  private cache: PalimpsestEvent[] | undefined
  // The raw string this instance last saw in localStorage, via load() or its own save().
  // undefined means "never observed" (skip the concurrency check on the next save()).
  private lastRaw: string | null | undefined = undefined

  constructor(private readonly key = 'palimpsest_pending') {}

  get size(): number { return this.cache?.length ?? 0 }

  async load(): Promise<PalimpsestEvent[]> {
    const raw = localStorage.getItem(this.key)
    this.lastRaw = raw
    if (raw === null) { this.cache = []; return [] }
    try {
      this.cache = JSON.parse(raw) as PalimpsestEvent[]
      return this.cache
    } catch {
      this.cache = []
      return []
    }
  }

  // Throws ConcurrentModificationError if another instance (e.g. another browser tab)
  // has written to this key since our last load()/save() — otherwise a blind overwrite
  // here would silently drop that other writer's events. Callers must use updatePending
  // rather than calling save() directly after a load().
  async save(events: PalimpsestEvent[]): Promise<void> {
    if (this.lastRaw !== undefined && localStorage.getItem(this.key) !== this.lastRaw) {
      throw new ConcurrentModificationError()
    }
    const serialized = JSON.stringify(events)
    localStorage.setItem(this.key, serialized)
    this.cache = events
    this.lastRaw = serialized
  }
}
