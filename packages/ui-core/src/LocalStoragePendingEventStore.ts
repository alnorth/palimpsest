import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from './PendingEventStore.js'

export class LocalStoragePendingEventStore implements PendingEventStore {
  constructor(private readonly key = 'palimpsest_pending') {}

  async load(): Promise<PalimpsestEvent[]> {
    const raw = localStorage.getItem(this.key)
    if (raw === null) return []
    try {
      return JSON.parse(raw) as PalimpsestEvent[]
    } catch {
      return []
    }
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(events))
  }
}
