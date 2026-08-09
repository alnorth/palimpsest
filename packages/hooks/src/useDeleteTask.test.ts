// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { PalimpsestStore, applyEvent, cloneState } from '@alnorth/palimpsest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useDeleteTask } from './useDeleteTask'
import { useTask } from './useTask'

// A FakeStore whose doAppend actually folds appended events into its state via the real
// projection, so a deleted task is visible on the very next getState() call — mirroring how
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

describe('useDeleteTask', () => {
  test('deletes an open task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => ({
      deleteTask: useDeleteTask(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.task.isLoading).toBe(false))

    await act(async () => { await result.current.deleteTask.mutate(task.id) })

    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.deleted', taskId: task.id })]])
    await waitFor(() => expect(result.current.task.data?.status).toBe('deleted'))
  })

  test('surfaces "already deleted" as error, and never appends', async () => {
    const task = makeTask({ status: 'deleted' })
    const store = new RecordingStore(buildState({ tasks: [task] }))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.deleteTask.mutate(task.id)).rejects.toThrow('already deleted')
    })

    expect(result.current.deleteTask.error?.message).toMatch(/already deleted/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.deleteTask.mutate('missing')).rejects.toThrow('Task not found: missing')
    })

    expect(result.current.deleteTask.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    const firstMutate = result.current.deleteTask.mutate
    rerender()

    expect(result.current.deleteTask.mutate).toBe(firstMutate)
  })
})
