// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useProcessing } from './useProcessing'

describe('useProcessing', () => {
  test('takes no sphere argument and aggregates across all spheres', async () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const a = makeTask({ sphereId: sphereA.id, title: 'A', isNext: true })
    const b = makeTask({ sphereId: sphereB.id, title: 'B', isNext: true })
    const store = new FakeStore(buildState({ spheres: [sphereA, sphereB], tasks: [a, b] }))

    const { result } = await renderSuspendedHook(() => useProcessing(), { wrapper: makeWrapper(store) })
    expect(result.current.actionableTasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})
