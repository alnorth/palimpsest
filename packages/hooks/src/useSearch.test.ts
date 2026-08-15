// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper } from './testHelpers'
import { useSearch } from './useSearch'

describe('useSearch', () => {
  test('starts loading, then returns matching tasks and projects ranked by relevance', async () => {
    const task = makeTask({ title: 'Buy milk' })
    const other = makeTask({ title: 'Call dentist' })
    const store = new FakeStore(buildState({ tasks: [task, other] }))

    const { result } = renderHook(() => useSearch('milk'), { wrapper: makeWrapper(store) })
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy milk'])
    expect(result.current.error).toBeUndefined()
  })

  test('matches a partial word at the end (find-as-you-type)', async () => {
    const task = makeTask({ title: 'Buy groceries' })
    const store = new FakeStore(buildState({ tasks: [task] }))

    const { result } = renderHook(() => useSearch('groc'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy groceries'])
  })

  test('an empty query returns an empty-but-valid result, never loading and never an error', () => {
    const store = new FakeStore(buildState({ tasks: [makeTask({ title: 'Anything' })] }))

    const { result } = renderHook(() => useSearch(''), { wrapper: makeWrapper(store) })

    expect(result.current).toEqual({ data: [], isLoading: false, error: undefined, total: 0, truncated: false })
  })

  test('a whitespace-only query is treated the same as empty', () => {
    const store = new FakeStore(buildState({ tasks: [makeTask({ title: 'Anything' })] }))

    const { result } = renderHook(() => useSearch('   '), { wrapper: makeWrapper(store) })

    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  test('recomputes live as the query changes across renders, keystroke by keystroke', async () => {
    const task = makeTask({ title: 'Buy groceries' })
    const store = new FakeStore(buildState({ tasks: [task] }))

    let query = 'dent'
    const { result, rerender } = renderHook(() => useSearch(query), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])

    query = 'groc'
    rerender()
    await waitFor(() => expect(result.current.data?.length).toBe(1))
    expect(result.current.data?.[0]?.kind === 'task' ? result.current.data[0].task.title : undefined).toBe('Buy groceries')
  })

  test('surfaces an unresolved sphere name as an error, not a throw', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))
    const { result } = renderHook(() => useSearch('milk', { sphere: 'Nope' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error?.message).toMatch(/No sphere matching "Nope"/)
    expect(result.current.data).toBeUndefined()
  })

  test('limit truncates and reports total/truncated', async () => {
    const tasks = ['Milk one', 'Milk two', 'Milk three'].map(title => makeTask({ title }))
    const store = new FakeStore(buildState({ tasks }))
    const { result } = renderHook(() => useSearch('milk', { limit: 2 }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.total).toBe(3)
    expect(result.current.truncated).toBe(true)
  })
})
