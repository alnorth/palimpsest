// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePickList } from './usePickList'

// Isolates the "raw result missing" branch from the (currently unreachable in the real render
// path — useRunQuery's use() suspends before ever returning undefined for a defined command)
// defensive fallback usePickList should have anyway, matching every other Paginated-returning hook.
vi.mock('./internal/useRunQuery', () => ({ useRunQuery: () => undefined }))
vi.mock('./PalimpsestProvider', () => ({ usePalimpsestContext: () => ({ currentSphereId: 'sphere-1' }) }))

describe('usePickList defensive fallback', () => {
  test('returns an empty array, not undefined, when useRunQuery yields no result for a resolved sphere', () => {
    const { result } = renderHook(() => usePickList())
    expect(result.current).toEqual([])
  })
})
