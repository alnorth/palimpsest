// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeProject, makeTask, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { useTasks } from './useTasks.js'
import { useTask } from './useTask.js'

describe('useTasks', () => {
  test('starts loading, then returns matching tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = renderHook(() => useTasks({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(t => t.title)).toEqual(['Ship it'])
    expect(result.current.error).toBeUndefined()
  })

  test('maps inbox filter to noProject', async () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const withProject = makeTask({ projectId: project.id, title: 'HasProject' })
    const noProject = makeTask({ sphereId: sphere.id, title: 'NoProject' })
    const store = new FakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [withProject, noProject] }))

    const { result } = renderHook(() => useTasks({ inbox: true }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(t => t.title)).toEqual(['NoProject'])
  })

  test('surfaces an unresolved sphere name as an error, not a throw', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))
    const { result } = renderHook(() => useTasks({ sphere: 'Nope' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error?.message).toMatch(/No sphere matching "Nope"/)
    expect(result.current.data).toBeUndefined()
  })

  test('limit truncates and reports total/truncated', async () => {
    const sphere = makeSphere()
    const tasks = [1, 2, 3].map(n => makeTask({ sphereId: sphere.id, title: `T${n}`, dueDate: `2026-08-0${n}` }))
    const store = new FakeStore(buildState({ spheres: [sphere], tasks }))
    const { result } = renderHook(() => useTasks({ limit: 2 }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(3)
    expect(result.current.truncated).toBe(true)
  })
})

describe('useTask', () => {
  test('returns a single task by id', async () => {
    const task = makeTask({ title: 'Find me' })
    const store = new FakeStore(buildState({ tasks: [task] }))
    const { result } = renderHook(() => useTask(task.id), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.title).toBe('Find me')
  })

  test('surfaces an unknown id as an error', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = renderHook(() => useTask('missing'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error?.message).toMatch(/No task with id "missing"/)
  })
})
