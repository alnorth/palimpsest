// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { Suspense, use } from 'react'
import { render, renderHook, screen, waitFor, act } from '@testing-library/react'
import { makeSphere, buildState } from './testFixtures'
import { PalimpsestProvider, usePalimpsestContext } from './PalimpsestProvider'
import { FakeStore, TestErrorBoundary, makeWrapper } from './testHelpers'

describe('PalimpsestProvider', () => {
  test('starts connecting and resolves projState once the store connects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })

    expect(result.current.isConnecting).toBe(true)
    expect(result.current.projState).toBeUndefined()

    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(result.current.projState?.spheres.get(sphere.id)?.name).toBe('Work')
    expect(result.current.connectionError).toBeUndefined()
  })

  test('surfaces a failed connect as connectionError on the non-throwing context mirror', async () => {
    const store = new FakeStore(buildState({}))
    store.initError = new Error('boom')
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })

    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(result.current.connectionError?.message).toBe('boom')
    expect(result.current.projState).toBeUndefined()
  })

  test('updates projState when the store notifies', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))

    const other = makeSphere({ name: 'Personal' })
    act(() => { store.setState(buildState({ spheres: [sphere, other] })) })

    await waitFor(() => expect(result.current.projState?.spheres.size).toBe(2))
  })

  test('setCurrentSphere updates currentSphereId', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    const { result } = renderHook(() => usePalimpsestContext(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))

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
    await waitFor(() => expect(result.current.isConnecting).toBe(false))

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

  test('use(stateResource) suspends until connect resolves, then never re-suspends on a live update', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const store = new FakeStore(buildState({ spheres: [sphere] }))
    let fallbackRenders = 0

    function Fallback() {
      fallbackRenders += 1
      return <div data-testid="fallback" />
    }

    // Mirrors how a real read hook must consume this context: call use(stateResource) only while
    // the plain projState mirror is still undefined, then read the mirror directly forever after
    // — see useRunQuery.ts and the doc comment on PalimpsestContextValue.stateResource for why
    // calling use() again on every update (even with an already-resolved promise) would still
    // cost a real suspend/resume flicker.
    function Probe() {
      const { stateResource, projState } = usePalimpsestContext()
      const state = projState !== undefined ? projState : use(stateResource)
      return <div data-testid="result">{state.spheres.size}</div>
    }

    // FakeStore resolves within a single microtask flush, so by the time this awaited act() call
    // returns, the connect promise has already settled — the transient fallback isn't reliably
    // observable here (that would need a store whose init() genuinely takes real wall-clock time).
    // What this test actually asserts is the "no re-suspension" invariant: fallbackRenders must
    // not increase across the live update below.
    await act(async () => {
      render(
        <PalimpsestProvider store={store}>
          <Suspense fallback={<Fallback />}>
            <Probe />
          </Suspense>
        </PalimpsestProvider>,
      )
    })

    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('1'))
    const fallbackRendersAfterFirstLoad = fallbackRenders

    act(() => { store.setState(buildState({ spheres: [sphere, makeSphere({ name: 'Personal' })] })) })

    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('2'))
    expect(fallbackRenders).toBe(fallbackRendersAfterFirstLoad)
  })

  test('use(stateResource) throws a connect failure for an ErrorBoundary to catch', async () => {
    const store = new FakeStore(buildState({}))
    store.initError = new Error('offline')
    let caught: Error | undefined

    function Probe() {
      const { stateResource } = usePalimpsestContext()
      use(stateResource)
      return null
    }

    await act(async () => {
      render(
        <PalimpsestProvider store={store}>
          <TestErrorBoundary onError={e => { caught = e }}>
            <Suspense fallback={<div data-testid="fallback" />}>
              <Probe />
            </Suspense>
          </TestErrorBoundary>
        </PalimpsestProvider>,
      )
    })

    await waitFor(() => expect(caught?.message).toBe('offline'))
  })
})
