// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeContext, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { usePickList } from './usePickList'
import { usePalimpsestContext } from './PalimpsestProvider'

describe('usePickList', () => {
  test('groups actionable, context-bearing tasks by context for an explicit sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: '@errand' })
    const task = makeTask({ sphereId: sphere.id, title: 'DoIt', isNext: true, contextId: context.id })
    const store = new FakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => usePickList('Work'), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual([
      { context: { id: context.id, name: '@errand' }, tasks: [expect.objectContaining({ title: 'DoIt' })] },
    ])
  })

  test('returns an empty result, not an error, when no sphere resolves', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = await renderSuspendedHook(() => usePickList(), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual([])
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

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      pickList: usePickList('Personal'),
    }), { wrapper: makeWrapper(store) })

    act(() => { result.current.ctx.setCurrentSphere(work.id) })

    await waitFor(() => expect(result.current.ctx.currentSphereId).toBe(work.id))
    expect(result.current.pickList.map(g => g.context.name)).toEqual(['@personal-errand'])
  })
})
