import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from 'palimpsest'
import type { PendingEventStore } from 'palimpsest-ui-core'

export class FilePendingEventStore implements PendingEventStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<PalimpsestEvent[]> {
    if (!existsSync(this.filePath)) return []
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    if (!raw) return []
    return JSON.parse(raw) as PalimpsestEvent[]
  }

  async save(unsyncedEvents: PalimpsestEvent[]): Promise<void> {
    writeFileSync(this.filePath, JSON.stringify(unsyncedEvents), 'utf-8')
  }
}
