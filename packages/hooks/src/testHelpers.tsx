import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import type { RenderHookOptions, RenderHookResult } from '@testing-library/react'
import { PalimpsestStore, applyEvent, cloneState } from '@alnorth/palimpsest'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { PalimpsestProvider } from './PalimpsestProvider'

// Catches a read hook's thrown query/connection error (see useRunQuery.ts, PalimpsestProvider.tsx)
// the same way a consuming app's own <ErrorBoundary> would, so tests can assert on it via
// `onError` instead of a returned `error` field (there isn't one anymore).
interface TestErrorBoundaryProps {
  children: ReactNode
  onError?: (error: Error) => void
}
interface TestErrorBoundaryState {
  error: Error | undefined
}
export class TestErrorBoundary extends Component<TestErrorBoundaryProps, TestErrorBoundaryState> {
  override state: TestErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: unknown): TestErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error instanceof Error ? error : new Error(String(error)))
  }

  override render(): ReactNode {
    if (this.state.error !== undefined) {
      return <div data-testid="error">{this.state.error.message}</div>
    }
    return this.props.children
  }
}

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

// Every read hook can now suspend (PalimpsestProvider's initial connect) or throw (a connection
// failure, or runQuery itself throwing e.g. an unresolved sphere name) — so every test wrapper
// needs a <Suspense> boundary and an error boundary the same way a real consuming app would. The
// fallback renders a `data-testid="fallback"` div, and `onError` surfaces a caught error for
// assertions in place of the old `.error` return field.
export function makeWrapper(store: PalimpsestStore, opts?: { initialSphere?: string; onError?: (error: Error) => void }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PalimpsestProvider store={store} {...(opts?.initialSphere !== undefined && { initialSphere: opts.initialSphere })}>
        <Suspense fallback={<div data-testid="fallback" />}>
          <TestErrorBoundary {...(opts?.onError !== undefined && { onError: opts.onError })}>{children}</TestErrorBoundary>
        </Suspense>
      </PalimpsestProvider>
    )
  }
}

// A hook wrapped in makeWrapper() can suspend on its very first render (PalimpsestProvider's
// initial connect via use()). React only flushes the passive effect that resolves that promise
// when the render triggering it happened inside an *awaited* async act() — a plain renderHook()
// call (which wraps its render in a synchronous act() internally) never gets that flush, so
// result.current would be stuck forever. Wrapping the initial renderHook() call here is the fix;
// no special handling is needed for rerender()/subsequent interactions, since after the first
// resolution the same stateResource promise is already fulfilled and use() never suspends again.
export async function renderSuspendedHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
): Promise<RenderHookResult<Result, Props>> {
  let hookResult!: RenderHookResult<Result, Props>
  await act(async () => {
    hookResult = renderHook(callback, options)
  })
  return hookResult
}
