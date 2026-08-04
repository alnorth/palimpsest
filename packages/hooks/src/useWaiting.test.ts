// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { useWaiting } from './useWaiting.js'

describe('useWaiting', () => {
  test('groups waiting tasks by kind for the given sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'Review', waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphere], tasks: [reviewTask] }))

    const { result } = renderHook(() => useWaiting('Work'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([{ kind: 'review', tasks: [expect.objectContaining({ title: 'Review' })] }])
  })

  test('sphere is optional: aggregates across all spheres when omitted', async () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const a = makeTask({ sphereId: sphereA.id, title: 'A', waitingFor: { kind: 'review' } })
    const b = makeTask({ sphereId: sphereB.id, title: 'B', waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphereA, sphereB], tasks: [a, b] }))

    const { result } = renderHook(() => useWaiting(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.[0]?.tasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})
