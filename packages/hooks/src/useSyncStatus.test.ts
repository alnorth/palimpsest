// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { buildState } from './testFixtures'
import { FakeStore, makeWrapper } from './testHelpers'
import { useSyncStatus } from './useSyncStatus'

describe('useSyncStatus', () => {
  test('reflects the connecting state and then settles', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = renderHook(() => useSyncStatus(), { wrapper: makeWrapper(store) })
    expect(result.current.isConnecting).toBe(true)
    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(result.current.connectionError).toBeUndefined()
  })

  test('surfaces a connection error', async () => {
    const store = new FakeStore(buildState({}))
    store.initError = new Error('offline')
    const { result } = renderHook(() => useSyncStatus(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isConnecting).toBe(false))
    expect(result.current.connectionError?.message).toBe('offline')
  })
})
