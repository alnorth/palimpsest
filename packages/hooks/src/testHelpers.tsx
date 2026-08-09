import type { ReactNode } from 'react'
import { PalimpsestStore, applyEvent, cloneState } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { PalimpsestProvider } from './PalimpsestProvider'

export class FakeStore extends PalimpsestStore {
  private state: ProjectionState
  initError: Error | undefined

  constructor(state: ProjectionState) {
    super()
    this.state = state
  }

  override async readAllEvents() { return [] }
  protected override async doAppend() {}

  override async init(): Promise<void> {
    if (this.initError !== undefined) throw this.initError
  }

  override async getState(): Promise<ProjectionState> {
    return this.state
  }

  setState(state: ProjectionState): void {
    this.state = state
    this.notify()
  }

  /** Updates the underlying state without notifying subscribers — for isolating refresh()'s
   *  getState()-refetch fallback from the subscribe/notify live-update path. */
  setStateQuietly(state: ProjectionState): void {
    this.state = state
  }
}

// A FakeStore whose doAppend actually folds appended events into its state via the real
// projection, so a write is visible on the very next getState() call — mirroring how
// PollingStore's readAllEvents() already folds pending events into every projection in production.
// getState() returns a fresh clone each call (as the real project()-backed getState() does) so
// React sees a new ProjectionState reference and re-renders, rather than bailing out on an
// unchanged object identity. Used by every write-hook test (useCompleteTask, useSetDueDate,
// useDeleteTask, ...) to assert on the events a mutation appends.
export class RecordingStore extends PalimpsestStore {
  private state: ProjectionState
  readonly appended: PalimpsestEvent[][] = []

  constructor(state: ProjectionState) {
    super()
    this.state = state
  }

  override async readAllEvents(): Promise<PalimpsestEvent[]> { return [] }

  protected override async doAppend(events: PalimpsestEvent[]): Promise<void> {
    this.appended.push(events)
    for (const event of events) applyEvent(this.state, event)
  }

  override async getState(): Promise<ProjectionState> { return cloneState(this.state) }
}

export function makeWrapper(store: PalimpsestStore, opts?: { initialSphere?: string }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PalimpsestProvider store={store} {...(opts?.initialSphere !== undefined && { initialSphere: opts.initialSphere })}>
        {children}
      </PalimpsestProvider>
    )
  }
}
