import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'
import { project } from './projection.js'

export abstract class PalimpsestStore {
  abstract readAllEvents(): PalimpsestEvent[]
  abstract appendEvents(events: PalimpsestEvent[]): void

  getState(): ProjectionState {
    return project(this.readAllEvents())
  }
}

export class FilePalimpsestStore extends PalimpsestStore {
  readonly filePath: string

  constructor(filePath: string) {
    super()
    this.filePath = filePath
  }

  readAllEvents(): PalimpsestEvent[] {
    if (!existsSync(this.filePath)) return []
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    if (!raw) return []
    return raw.split('\n').map((line: string) => JSON.parse(line) as PalimpsestEvent)
  }

  appendEvents(events: PalimpsestEvent[]): void {
    if (events.length === 0) return
    appendFileSync(this.filePath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
  }
}
