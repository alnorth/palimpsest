// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { PalimpsestStore, applyEvent, cloneState } from '@alnorth/palimpsest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetDueDate } from './useSetDueDate'
import { useTask } from './useTask'

// A FakeStore whose doAppend actually folds appended events into its state via the real
// projection, so a due-date change is visible on the very next getState() call — mirroring how
// PollingStore's readAllEvents() already folds pending events into every projection in production.
// getState() returns a fresh clone each call (as the real project()-backed getState() does) so
// React sees a new ProjectionState reference and re-renders, rather than bailing out on an
// unchanged object identity.
class RecordingStore extends PalimpsestStore {
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

describe('useSetDueDate', () => {
  test('sets a due date on an open task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => ({
      setDueDate: useSetDueDate(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.task.isLoading).toBe(false))

    await act(async () => { await result.current.setDueDate.mutate({ taskId: task.id, dueDate: '2026-08-15' }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { dueDate: '2026-08-15' },
    })]])
    await waitFor(() => expect(result.current.task.data?.dueDate).toBe('2026-08-15'))
  })

  test('clears a due date when dueDate is null', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open', dueDate: '2026-01-01' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => ({
      setDueDate: useSetDueDate(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.task.isLoading).toBe(false))

    await act(async () => { await result.current.setDueDate.mutate({ taskId: task.id, dueDate: null }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { dueDate: null },
    })]])
    await waitFor(() => expect(result.current.task.data?.dueDate).toBeNull())
  })

  test('surfaces "cannot update a completed task" as error, and never appends', async () => {
    const task = makeTask({ status: 'completed' })
    const store = new RecordingStore(buildState({ tasks: [task] }))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      setDueDate: useSetDueDate(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.setDueDate.mutate({ taskId: task.id, dueDate: '2026-08-15' }))
        .rejects.toThrow('Cannot update a completed task')
    })

    expect(result.current.setDueDate.error?.message).toMatch(/Cannot update a completed task/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      setDueDate: useSetDueDate(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.setDueDate.mutate({ taskId: 'missing', dueDate: '2026-08-15' }))
        .rejects.toThrow('Task not found: missing')
    })

    expect(result.current.setDueDate.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      setDueDate: useSetDueDate(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    const firstMutate = result.current.setDueDate.mutate
    rerender()

    expect(result.current.setDueDate.mutate).toBe(firstMutate)
  })
})
