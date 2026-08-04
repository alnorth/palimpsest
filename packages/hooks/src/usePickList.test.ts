// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeContext, makeTask, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { usePickList } from './usePickList.js'

describe('usePickList', () => {
  test('groups actionable, context-bearing tasks by context for an explicit sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: '@errand' })
    const task = makeTask({ sphereId: sphere.id, title: 'DoIt', isNext: true, contextId: context.id })
    const store = new FakeStore(buildState({ spheres: [sphere], contexts: [context], tasks: [task] }))

    const { result } = renderHook(() => usePickList('Work'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([
      { context: { id: context.id, name: '@errand' }, tasks: [expect.objectContaining({ title: 'DoIt' })] },
    ])
  })

  test('returns an empty result, not an error, when no sphere resolves', async () => {
    const store = new FakeStore(buildState({}))
    const { result } = renderHook(() => usePickList(), { wrapper: makeWrapper(store) })
    expect(result.current).toEqual({ data: [], isLoading: false, error: undefined })
  })
})
