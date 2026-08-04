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
