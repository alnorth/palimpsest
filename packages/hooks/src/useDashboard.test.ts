// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { useDashboard } from './useDashboard.js'
import { usePalimpsestContext } from './PalimpsestProvider.js'

describe('useDashboard', () => {
  test('returns due-today/overdue/starred tasks when an explicit sphere is given', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2020-01-01' })
    const notDue = makeTask({ sphereId: sphere.id, title: 'NotDue', dueDate: '2099-01-01' })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [overdue, notDue] }))

    const { result } = renderHook(() => useDashboard('Work'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(t => t.title)).toEqual(['Overdue'])
  })

  test('falls back to the context current sphere when no argument is given', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const starred = makeTask({ sphereId: sphere.id, title: 'Starred', isStarred: true })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [starred] }))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      dashboard: useDashboard(),
    }), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))
    expect(result.current.dashboard.data).toEqual([])

    act(() => { result.current.ctx.setCurrentSphere(sphere.id) })
    await waitFor(() => expect(result.current.dashboard.data?.map(t => t.title)).toEqual(['Starred']))
  })

  test('returns an empty result, not an error, when no sphere resolves', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = renderHook(() => useDashboard(), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual({ data: [], isLoading: false, error: undefined, total: 0, truncated: false })
  })
})
