import type { PalimpsestEvent } from './events.js'

export interface PendingEventStore {
  load(): Promise<PalimpsestEvent[]>
  save(unsyncedEvents: PalimpsestEvent[]): Promise<void>
}

export class MemoryPendingEventStore implements PendingEventStore {
  private events: PalimpsestEvent[] = []

  async load(): Promise<PalimpsestEvent[]> {
    return this.events
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    this.events = events
  }
}
