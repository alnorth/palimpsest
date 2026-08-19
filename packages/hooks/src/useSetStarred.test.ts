// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper, renderSuspendedHook, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetStarred } from './useSetStarred'
import { useTask } from './useTask'

describe('useSetStarred', () => {
  test('stars an open task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      setStarred: useSetStarred(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setStarred.mutate({ taskId: task.id, starred: true }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { isStarred: true },
    })]])
    await waitFor(() => expect(result.current.task.isStarred).toBe(true))
  })

  test('unstars a previously-starred task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open', isStarred: true })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      setStarred: useSetStarred(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setStarred.mutate({ taskId: task.id, starred: false }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { isStarred: false },
    })]])
    await waitFor(() => expect(result.current.task.isStarred).toBe(false))
  })

  test('surfaces "cannot update a completed task" as error, and never appends', async () => {
    const task = makeTask({ status: 'completed' })
    const store = new RecordingStore(buildState({ tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setStarred: useSetStarred(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setStarred.mutate({ taskId: task.id, starred: true }))
        .rejects.toThrow('Cannot update a completed task')
    })

    expect(result.current.setStarred.error?.message).toMatch(/Cannot update a completed task/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setStarred: useSetStarred(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setStarred.mutate({ taskId: 'missing', starred: true }))
        .rejects.toThrow('Task not found: missing')
    })

    expect(result.current.setStarred.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setStarred: useSetStarred(),
    }), { wrapper: makeWrapper(store) })

    const firstMutate = result.current.setStarred.mutate
    rerender()

    expect(result.current.setStarred.mutate).toBe(firstMutate)
  })
})
