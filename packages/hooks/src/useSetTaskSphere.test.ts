// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeProject, makeTask, buildState } from './testFixtures'
import { makeWrapper, renderSuspendedHook, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetTaskSphere } from './useSetTaskSphere'
import { useTask } from './useTask'

describe('useSetTaskSphere', () => {
  test('sets a new sphereId on a project-less task', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const task = makeTask({ sphereId: sphere.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere, otherSphere], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      setTaskSphere: useSetTaskSphere(),
      task: useTask(task.id),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setTaskSphere.mutate({ taskId: task.id, sphereId: otherSphere.id }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'task.updated', taskId: task.id, patch: { sphereId: otherSphere.id },
    })]])
    await waitFor(() => expect(result.current.task.sphere).toEqual({ id: otherSphere.id, name: 'Personal' }))
  })

  test('surfaces an unknown task id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setTaskSphere: useSetTaskSphere(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setTaskSphere.mutate({ taskId: 'missing', sphereId: 'sph-1' }))
        .rejects.toThrow('Task not found: missing')
    })

    expect(result.current.setTaskSphere.error?.message).toBe('Task not found: missing')
    expect(store.appended).toEqual([])
  })

  test('surfaces a task that belongs to a project as error, and never appends', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere)
    const task = makeTask({ projectId: project.id, status: 'open' })
    const store = new RecordingStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setTaskSphere: useSetTaskSphere(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setTaskSphere.mutate({ taskId: task.id, sphereId: sphere.id }))
        .rejects.toThrow(/cannot have both a projectId and a direct sphereId/)
    })

    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setTaskSphere: useSetTaskSphere(),
    }), { wrapper: makeWrapper(store) })

    const firstMutate = result.current.setTaskSphere.mutate
    rerender()

    expect(result.current.setTaskSphere.mutate).toBe(firstMutate)
  })
})
