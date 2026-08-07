import type { PalimpsestEvent } from './events'
import type { ProjectionState } from './projection'
import { project } from './projection'
import { validateBatch } from './validation'

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
