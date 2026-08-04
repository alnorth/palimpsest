import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'
import { PalimpsestStore } from './store.js'

export class FilePalimpsestStore extends PalimpsestStore {
  readonly filePath: string
  private cachedEvents: PalimpsestEvent[] | undefined

  constructor(filePath: string, initialState?: ProjectionState) {
    super(initialState)
    this.filePath = filePath
  }

  override async init(): Promise<void> {
    if (!existsSync(this.filePath)) { this.cachedEvents = []; return }
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    this.cachedEvents = raw ? raw.split('\n').map(line => JSON.parse(line) as PalimpsestEvent) : []
  }

  readAllEvents(): Promise<PalimpsestEvent[]> {
    return Promise.resolve(this.cachedEvents ?? [])
  }

  protected override doAppend(events: PalimpsestEvent[]): Promise<void> {
    appendFileSync(this.filePath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
    if (this.cachedEvents !== undefined) this.cachedEvents = [...this.cachedEvents, ...events]
    return Promise.resolve()
  }
}
