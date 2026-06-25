import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'
import { project } from './projection.js'

export class PalimpsestStore {
  readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  readAllEvents(): PalimpsestEvent[] {
    if (!existsSync(this.filePath)) return []
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    if (!raw) return []
    return raw.split('\n').map(line => JSON.parse(line) as PalimpsestEvent)
  }

  appendEvent(event: PalimpsestEvent): void {
    appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf-8')
  }

  appendEvents(events: PalimpsestEvent[]): void {
    if (events.length === 0) return
    appendFileSync(this.filePath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
  }

  getState(): ProjectionState {
    return project(this.readAllEvents())
  }
}
