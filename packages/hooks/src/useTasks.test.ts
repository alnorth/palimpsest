// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeProject, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useTasks } from './useTasks'
import { useTask } from './useTask'

describe('useTasks', () => {
  test('returns matching tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => useTasks({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(t => t.title)).toEqual(['Ship it'])
  })

  test('maps inbox filter to noProject', async () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const withProject = makeTask({ projectId: project.id, title: 'HasProject' })
    const noProject = makeTask({ sphereId: sphere.id, title: 'NoProject' })
    const store = new FakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [withProject, noProject] }))

    const { result } = await renderSuspendedHook(() => useTasks({ inbox: true }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(t => t.title)).toEqual(['NoProject'])
  })

  test('propagates an unresolved sphere name to the ErrorBoundary', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))
    let caught: Error | undefined

    await renderSuspendedHook(() => useTasks({ sphere: 'Nope' }), { wrapper: makeWrapper(store, { onError: e => { caught = e } }) })

    expect(caught?.message).toMatch(/No sphere matching "Nope"/)
  })

  test('limit truncates and reports total/truncated', async () => {
    const sphere = makeSphere()
    const tasks = [1, 2, 3].map(n => makeTask({ sphereId: sphere.id, title: `T${n}`, dueDate: `2026-08-0${n}` }))
    const store = new FakeStore(buildState({ spheres: [sphere], tasks }))
    const { result } = await renderSuspendedHook(() => useTasks({ limit: 2 }), { wrapper: makeWrapper(store) })
    expect(result.current.total).toBe(3)
    expect(result.current.truncated).toBe(true)
  })

  test('memoizes by filter content, not object identity: a fresh-but-equivalent inline filter on re-render does not recompute', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    // The callback below constructs a brand-new `{ sphere: 'Work' }` object literal on every
    // invocation (including on rerender()), so this exercises the exact "new identity, same
    // value" case useRunQuery's JSON.stringify(command) keying is meant to absorb.
    const { result, rerender } = await renderSuspendedHook(() => useTasks({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    const firstItems = result.current.items

    rerender()

    expect(result.current.items).toBe(firstItems)
  })

  test('does recompute when the filter value actually changes across renders', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const task = makeTask({ sphereId: sphere.id, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [task] }))

    let starredOnly = false
    const { result, rerender } = await renderSuspendedHook(() => useTasks({ starred: starredOnly }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(t => t.title)).toEqual(['Ship it'])

    starredOnly = true
    rerender()

    expect(result.current.items).toEqual([])
  })
})

describe('useTask', () => {
  test('returns a single task by id', async () => {
    const task = makeTask({ title: 'Find me' })
    const store = new FakeStore(buildState({ tasks: [task] }))
    const { result } = await renderSuspendedHook(() => useTask(task.id), { wrapper: makeWrapper(store) })
    expect(result.current.title).toBe('Find me')
  })

  test('propagates an unknown id to the ErrorBoundary', async () => {
    const store = new FakeStore(buildState({}))
    let caught: Error | undefined

    await renderSuspendedHook(() => useTask('missing'), { wrapper: makeWrapper(store, { onError: e => { caught = e } }) })

    expect(caught?.message).toMatch(/No task with id "missing"/)
  })
})
