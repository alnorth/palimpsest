// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useWaiting } from './useWaiting'

describe('useWaiting', () => {
  test('groups waiting tasks by kind for the given sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'Review', waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [reviewTask] }))

    const { result } = await renderSuspendedHook(() => useWaiting('Work'), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual([{ kind: 'review', tasks: [expect.objectContaining({ title: 'Review' })] }])
  })

  test('sphere is optional: aggregates across all spheres when omitted', async () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const a = makeTask({ sphereId: sphereA.id, title: 'A', waitingFor: { kind: 'review' } })
    const b = makeTask({ sphereId: sphereB.id, title: 'B', waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphereA, sphereB], tasks: [a, b] }))

    const { result } = await renderSuspendedHook(() => useWaiting(), { wrapper: makeWrapper(store) })
    expect(result.current[0]?.tasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})
