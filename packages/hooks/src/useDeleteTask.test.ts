// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { makeWrapper, renderSuspendedHook, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useDeleteTask } from './useDeleteTask'
import { useTask } from './useTask'

describe('useDeleteTask', () => {
  test('deletes an open task', async () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      deleteTask: useDeleteTask(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.deleteTask.mutate(task.id) })

    expect(store.appended).toEqual([[expect.objectContaining({ type: 'task.deleted', taskId: task.id })]])
    await waitFor(() => expect(result.current.task.status).toBe('deleted'))
  })

  test('surfaces "already deleted" as error, and never appends', async () => {
    const task = makeTask({ status: 'deleted' })
    const store = new RecordingStore(buildState({ tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.deleteTask.mutate(task.id)).rejects.toThrow('already deleted')
    })

    expect(result.current.deleteTask.error?.message).toMatch(/already deleted/)
    expect(store.appended).toEqual([])
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.deleteTask.mutate('missing')).rejects.toThrow('Task not found: missing')
    })

    expect(result.current.deleteTask.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      deleteTask: useDeleteTask(),
    }), { wrapper: makeWrapper(store) })

    const firstMutate = result.current.deleteTask.mutate
    rerender()

    expect(result.current.deleteTask.mutate).toBe(firstMutate)
  })
})
