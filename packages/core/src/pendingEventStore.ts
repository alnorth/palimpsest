import type { PalimpsestEvent } from './events.js'

export interface PendingEventStore {
  readonly size: number
  load(): Promise<PalimpsestEvent[]>
  save(unsyncedEvents: PalimpsestEvent[]): Promise<void>
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
