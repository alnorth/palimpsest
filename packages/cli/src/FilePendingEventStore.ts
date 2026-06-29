import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from 'palimpsest'

export class FilePendingEventStore implements PendingEventStore {
  private cache: PalimpsestEvent[] | undefined

  constructor(private readonly filePath: string) {}

  get size(): number { return this.cache?.length ?? 0 }

  async load(): Promise<PalimpsestEvent[]> {
    if (!existsSync(this.filePath)) { this.cache = []; return [] }
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    this.cache = raw ? JSON.parse(raw) as PalimpsestEvent[] : []
    return this.cache
  }

  async save(events: PalimpsestEvent[]): Promise<void> {
    writeFileSync(this.filePath, JSON.stringify(events), 'utf-8')
    this.cache = events
  }
}
