import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'
import { project } from './projection.js'

export abstract class PalimpsestStore {
  readonly initialState: ProjectionState | undefined

  constructor(initialState?: ProjectionState) {
    this.initialState = initialState
  }

  abstract readAllEvents(): Promise<PalimpsestEvent[]>
  abstract appendEvents(events: PalimpsestEvent[]): Promise<void>

  async getState(): Promise<ProjectionState> {
    return project(await this.readAllEvents(), this.initialState)
  }
}

export class FilePalimpsestStore extends PalimpsestStore {
  readonly filePath: string

  constructor(filePath: string, initialState?: ProjectionState) {
    super(initialState)
    this.filePath = filePath
  }

  readAllEvents(): Promise<PalimpsestEvent[]> {
    if (!existsSync(this.filePath)) return Promise.resolve([])
    const raw = readFileSync(this.filePath, 'utf-8').trim()
    if (!raw) return Promise.resolve([])
    return Promise.resolve(
      raw.split('\n').map((line: string) => JSON.parse(line) as PalimpsestEvent)
    )
  }

  appendEvents(events: PalimpsestEvent[]): Promise<void> {
    if (events.length === 0) return Promise.resolve()
    appendFileSync(this.filePath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
    return Promise.resolve()
  }
}
