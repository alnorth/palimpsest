// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeSphere, buildState } from './testFixtures'
import { usePalimpsestContext } from './PalimpsestProvider'
import { FakeStore, makeWrapper } from './testHelpers'

describe('PalimpsestProvider', () => {
  test('starts loading and resolves projState once the store connects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.projState).toBeUndefined()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projState?.spheres.get(sphere.id)?.name).toBe('Work')
    expect(result.current.connectionError).toBeUndefined()
  })

  test('surfaces a failed connect as connectionError', async () => {
    const store = new FakeStore(buildState({}))
    store.initError = new Error('boom')
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.connectionError?.message).toBe('boom')
    expect(result.current.projState).toBeUndefined()
  })

  test('updates projState when the store notifies', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const other = makeSphere({ name: 'Personal' })
    act(() => { store.setState(buildState({ spheres: [sphere, other] })) })

    await waitFor(() => expect(result.current.projState?.spheres.size).toBe(2))
  })

  test('setCurrentSphere updates currentSphereId', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.currentSphereId).toBeUndefined()
    act(() => { result.current.setCurrentSphere(sphere.id) })
    await waitFor(() => expect(result.current.currentSphereId).toBe(sphere.id))
  })

  test('initialSphere resolves to a sphere id by name once connected', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store, { initialSphere: 'work' }) })

    await waitFor(() => expect(result.current.currentSphereId).toBe(sphere.id))
  })

  test('throws when used outside a PalimpsestProvider', () => {
    expect(() => renderHook(() => usePalimpsestContext())).toThrow(/must be used within/)
  })

  test('refresh() falls back to store.getState() for stores without a refresh() method', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Mutate the store's state WITHOUT notifying subscribers, so the only way projState can pick
    // it up is via refresh() explicitly re-fetching — isolating that fallback from the
    // subscribe/notify live-update path already covered by the 'updates projState when the store
    // notifies' test above.
    const other = makeSphere({ name: 'Personal' })
    store.setStateQuietly(buildState({ spheres: [sphere, other] }))
    expect(result.current.projState?.spheres.size).toBe(1)

    await act(async () => { await result.current.refresh() })

    expect(result.current.projState?.spheres.size).toBe(2)
  })
})
