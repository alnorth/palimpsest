import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from 'palimpsest'

export class LocalStoragePendingEventStore implements PendingEventStore {
  private cache: PalimpsestEvent[] | undefined

  constructor(private readonly key = 'palimpsest_pending') {}

  get size(): number { return this.cache?.length ?? 0 }

  async load(): Promise<PalimpsestEvent[]> {
    const raw = localStorage.getItem(this.key)
    if (raw === null) { this.cache = []; return [] }
    try {
      this.cache = JSON.parse(raw) as PalimpsestEvent[]
      return this.cache
    } catch {
      this.cache = []
      return []
    }
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(events))
    this.cache = events
  }
}
