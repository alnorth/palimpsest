// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWaiting } from './useWaiting'

// Isolates the "raw result missing" branch from the (currently unreachable in the real render
// path — useRunQuery's use() suspends before ever returning undefined for a defined command)
// defensive fallback useWaiting should have anyway, matching every other Paginated-returning hook.
vi.mock('./internal/useRunQuery', () => ({ useRunQuery: () => undefined }))

describe('useWaiting defensive fallback', () => {
  test('returns an empty array, not undefined, when useRunQuery yields no result', () => {
    const { result } = renderHook(() => useWaiting('Work'))
    expect(result.current).toEqual([])
  })
})
