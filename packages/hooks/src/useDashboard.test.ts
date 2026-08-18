// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useDashboard } from './useDashboard'
import { usePalimpsestContext } from './PalimpsestProvider'

describe('useDashboard', () => {
  test('returns due-today/overdue/starred tasks when an explicit sphere is given', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2020-01-01' })
    const notDue = makeTask({ sphereId: sphere.id, title: 'NotDue', dueDate: '2099-01-01' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [overdue, notDue] }))

    const { result } = await renderSuspendedHook(() => useDashboard('Work'), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(t => t.title)).toEqual(['Overdue'])
  })

  test('falls back to the context current sphere when no argument is given', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const starred = makeTask({ sphereId: sphere.id, title: 'Starred', isStarred: true })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [starred] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      dashboard: useDashboard(),
    }), { wrapper: makeWrapper(store) })

    expect(result.current.dashboard.items).toEqual([])

    act(() => { result.current.ctx.setCurrentSphere(sphere.id) })
    await waitFor(() => expect(result.current.dashboard.items.map(t => t.title)).toEqual(['Starred']))
  })

  test('returns an empty result, not an error, when no sphere resolves', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = await renderSuspendedHook(() => useDashboard(), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual({ items: [], total: 0, truncated: false })
  })

  test('an explicit sphere argument overrides the context current sphere, not just fills in for it', async () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workStarred = makeTask({ sphereId: work.id, title: 'WorkStarred', isStarred: true })
    const personalStarred = makeTask({ sphereId: personal.id, title: 'PersonalStarred', isStarred: true })
    const store = new FakeStore(buildState({ spheres: [work, personal], tasks: [workStarred, personalStarred] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      dashboard: useDashboard('Personal'),
    }), { wrapper: makeWrapper(store) })

    act(() => { result.current.ctx.setCurrentSphere(work.id) })

    await waitFor(() => expect(result.current.ctx.currentSphereId).toBe(work.id))
    expect(result.current.dashboard.items.map(t => t.title)).toEqual(['PersonalStarred'])
  })
})
