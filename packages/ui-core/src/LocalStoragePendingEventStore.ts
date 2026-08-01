import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from 'palimpsest'
import { LocalStorageJsonStore } from './LocalStorageJsonStore.js'

export class LocalStoragePendingEventStore implements PendingEventStore {
  private readonly json: LocalStorageJsonStore<PalimpsestEvent[]>
  private cache: PalimpsestEvent[] | undefined

  constructor(key = 'palimpsest_pending') {
    this.json = new LocalStorageJsonStore(key)
  }

  get size(): number { return this.cache?.length ?? 0 }

  async load(): Promise<PalimpsestEvent[]> {
    this.cache = (await this.json.load()) ?? []
    return this.cache
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    await this.json.save(events)
    this.cache = events
  }
}
