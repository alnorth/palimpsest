// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeSphere, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { useCurrentSphere } from './useCurrentSphere.js'

describe('useCurrentSphere', () => {
  test('lists all spheres and tracks the selected one', async () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const store = new FakeStore(buildState({ spheres: [work, personal] }))

    const { result } = renderHook(() => useCurrentSphere(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.spheres.length).toBe(2))
    expect(result.current.sphere).toBeUndefined()

    act(() => { result.current.setSphere(work.id) })
    await waitFor(() => expect(result.current.sphere?.name).toBe('Work'))
  })
})
