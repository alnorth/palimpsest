import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from 'palimpsest'
import { FileJsonStore } from './FileJsonStore.js'

export class FilePendingEventStore implements PendingEventStore {
  private readonly json: FileJsonStore<PalimpsestEvent[]>
  private cache: PalimpsestEvent[] | undefined

  constructor(filePath: string) {
    this.json = new FileJsonStore(filePath)
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
