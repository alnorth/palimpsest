// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useCurrentSphere } from './useCurrentSphere'

describe('useCurrentSphere', () => {
  test('lists all spheres and tracks the selected one', async () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const store = new FakeStore(buildState({ spheres: [work, personal] }))

    const { result } = await renderSuspendedHook(() => useCurrentSphere(), { wrapper: makeWrapper(store) })
    expect(result.current.spheres.length).toBe(2)
    expect(result.current.sphere).toBeUndefined()

    act(() => { result.current.setSphere(work.id) })
    await waitFor(() => expect(result.current.sphere?.name).toBe('Work'))
  })
})
