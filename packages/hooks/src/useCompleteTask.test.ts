// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PalimpsestEvent, ProjectionState } from '@alnorth/palimpsest'
import { PalimpsestStore, applyEvent, cloneState, nextDueDate } from '@alnorth/palimpsest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useCompleteTask } from './useCompleteTask'
import { useTask } from './useTask'

// A FakeStore whose doAppend actually folds appended events into its state via the real
// projection, so a completed task is visible on the very next getState() call — mirroring how
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

describe('useCompleteTask', () => {
  test('completes a non-recurring task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => ({
      complete: useCompleteTask(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.task.isLoading).toBe(false))

    await act(async () => { await result.current.complete.mutate(task.id) })

    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.completed', taskId: task.id })]])
    await waitFor(() => expect(result.current.task.data?.status).toBe('completed'))
  })

  test('recurs a recurring task instead of closing it', async () => {
    const sphere = makeSphere()
    const task = makeTask({
      sphereId: sphere.id, status: 'open', dueDate: '2026-06-25', dueDateExpression: 'every day',
    })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => ({
      complete: useCompleteTask(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.task.isLoading).toBe(false))

    const today = new Date().toISOString().slice(0, 10)
    const expectedNewDueDate = nextDueDate('every day', today)

    await act(async () => { await result.current.complete.mutate(task.id) })

    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.recurred', taskId: task.id })]])
    await waitFor(() => expect(result.current.task.data?.dueDate).toBe(expectedNewDueDate))
    expect(result.current.task.data?.status).toBe('open')
  })

  test('surfaces "already completed" as error, and never appends', async () => {
    const task = makeTask({ status: 'completed' })
    const store = new RecordingStore(buildState({ tasks: [task] }))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      complete: useCompleteTask(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.complete.mutate(task.id)).rejects.toThrow('already completed')
    })

    expect(result.current.complete.error?.message).toMatch(/already completed/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      complete: useCompleteTask(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.complete.mutate('missing')).rejects.toThrow('Task not found: missing')
    })

    expect(result.current.complete.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })
})
