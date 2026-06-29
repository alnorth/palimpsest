import type { PalimpsestEvent } from './events.js'

export interface PendingEventStore {
  load(): Promise<PalimpsestEvent[]>
  save(unsyncedEvents: PalimpsestEvent[]): Promise<void>
}

export class MemoryPendingEventStore implements PendingEventStore {
  async load(): Promise<PalimpsestEvent[]> {
    return []
  }

  async save(_unsyncedEvents: PalimpsestEvent[]): Promise<void> {}
}
