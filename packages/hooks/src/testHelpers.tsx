import type { ReactNode } from 'react'
import { PalimpsestStore } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import { PalimpsestProvider } from './PalimpsestProvider.js'

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

export function makeWrapper(store: PalimpsestStore, opts?: { initialSphere?: string }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PalimpsestProvider store={store} {...(opts?.initialSphere !== undefined && { initialSphere: opts.initialSphere })}>
        {children}
      </PalimpsestProvider>
    )
  }
}
