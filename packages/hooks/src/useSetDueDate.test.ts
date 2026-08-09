// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetDueDate } from './useSetDueDate'
import { useTask } from './useTask'

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
