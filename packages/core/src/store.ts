import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import type { PalimpsestEvent } from './events.js'
import type { ProjectionState } from './projection.js'
import { project } from './projection.js'
import { validateBatch } from './validation.js'

export abstract class PalimpsestStore {
  readonly initialState: ProjectionState | undefined
  private listeners = new Set<() => void>()

  constructor(initialState?: ProjectionState) {
    this.initialState = initialState
  }

  async init(): Promise<void> {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected notify(): void {
    for (const listener of this.listeners) listener()
  }

  start(): void {}
  stop(): void {}

  abstract readAllEvents(): Promise<PalimpsestEvent[]>
  protected abstract doAppend(events: PalimpsestEvent[]): Promise<void>

  async appendEvents(events: PalimpsestEvent[]): Promise<void> {
    if (events.length === 0) return
    validateBatch(await this.getState(), events)
    await this.doAppend(events)
    this.notify()
  }

  async getState(): Promise<ProjectionState> {
    return project(await this.readAllEvents(), this.initialState)
  }
}

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
