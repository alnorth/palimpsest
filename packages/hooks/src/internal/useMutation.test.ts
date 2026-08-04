// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { buildState } from '../testFixtures'
import { FakeStore, makeWrapper } from '../testHelpers'
import { usePalimpsestContext } from '../PalimpsestProvider'
import { useMutation } from './useMutation'

function renderMutation<TArgs, TResult>(
  store: FakeStore,
  fn: Parameters<typeof useMutation<TArgs, TResult>>[0],
) {
  return renderHook(() => ({
    ctx: usePalimpsestContext(),
    mutation: useMutation(fn),
  }), { wrapper: makeWrapper(store) })
}

async function waitForLoaded(result: { current: { ctx: { isLoading: boolean } } }): Promise<void> {
  await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))
}

describe('useMutation', () => {
  test('calls fn with the store, current projState, and the mutate args', async () => {
    const state = buildState({})
    const store = new FakeStore(state)
    const fn = vi.fn(async () => {})
    const { result } = renderMutation(store, fn)
    await waitForLoaded(result)

    await act(async () => { await result.current.mutation.mutate('task-1') })

    expect(fn).toHaveBeenCalledWith(store, state, 'task-1')
  })

  test('isPending is true while the mutation is in flight, false once it settles', async () => {
    const store = new FakeStore(buildState({}))
    let resolveFn: () => void = () => {}
    const fn = vi.fn(() => new Promise<void>(resolve => { resolveFn = resolve }))
    const { result } = renderMutation(store, fn)
    await waitForLoaded(result)

    let pending: Promise<void> = Promise.resolve()
    act(() => { pending = result.current.mutation.mutate('x') })
    expect(result.current.mutation.isPending).toBe(true)

    await act(async () => {
      resolveFn()
      await pending
    })
    expect(result.current.mutation.isPending).toBe(false)
  })

  test('a rejected fn sets error, clears isPending, and rejects the returned promise', async () => {
    const store = new FakeStore(buildState({}))
    const fn = vi.fn(async () => { throw new Error('boom') })
    const { result } = renderMutation(store, fn)
    await waitForLoaded(result)

    await act(async () => {
      await expect(result.current.mutation.mutate('x')).rejects.toThrow('boom')
    })

    expect(result.current.mutation.error?.message).toBe('boom')
    expect(result.current.mutation.isPending).toBe(false)
  })

  test('a later successful call clears a previous error', async () => {
    const store = new FakeStore(buildState({}))
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderMutation(store, fn)
    await waitForLoaded(result)

    await act(async () => {
      await expect(result.current.mutation.mutate('x')).rejects.toThrow('boom')
    })
    expect(result.current.mutation.error?.message).toBe('boom')

    await act(async () => { await result.current.mutation.mutate('x') })
    expect(result.current.mutation.error).toBeUndefined()
  })

  test('does not call fn when the context has not loaded yet, and rejects instead', async () => {
    const store = new FakeStore(buildState({}))
    const fn = vi.fn(async () => {})
    // Rendered but not awaited: on the very first render, before the Provider's init effect has
    // resolved, projState is still undefined.
    const { result } = renderHook(() => useMutation<string, void>(fn), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.mutate('x')).rejects.toThrow(/not loaded/)
    })

    expect(fn).not.toHaveBeenCalled()
  })
})
