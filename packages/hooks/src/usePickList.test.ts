// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeSphere, makeContext, makeTask, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { usePickList } from './usePickList.js'
import { usePalimpsestContext } from './PalimpsestProvider.js'

describe('usePickList', () => {
  test('groups actionable, context-bearing tasks by context for an explicit sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: '@errand' })
    const task = makeTask({ sphereId: sphere.id, title: 'DoIt', isNext: true, contextId: context.id })
    const store = new FakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [task] }))

    const { result } = renderHook(() => usePickList('Work'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([
      { context: { id: context.id, name: '@errand' }, tasks: [expect.objectContaining({ title: 'DoIt' })] },
    ])
  })

  test('returns an empty result, not an error, when no sphere resolves', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = renderHook(() => usePickList(), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual({ data: [], isLoading: false, error: undefined })
  })

  test('an explicit sphere argument overrides the context current sphere, not just fills in for it', async () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workContext = makeContext(work, { name: '@work-errand' })
    const personalContext = makeContext(personal, { name: '@personal-errand' })
    const workTask = makeTask({ sphereId: work.id, title: 'WorkTask', isNext: true, contextId: workContext.id })
    const personalTask = makeTask({ sphereId: personal.id, title: 'PersonalTask', isNext: true, contextId: personalContext.id })
    const store = new FakeStore(buildState({
      spheres: [work, personal], contexts: [workContext, personalContext], tasks: [workTask, personalTask],
    }))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      pickList: usePickList('Personal'),
    }), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))
    act(() => { result.current.ctx.setCurrentSphere(work.id) })

    await waitFor(() => expect(result.current.ctx.currentSphereId).toBe(work.id))
    expect(result.current.pickList.data?.map(g => g.context.name)).toEqual(['@personal-errand'])
  })
})
