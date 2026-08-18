// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useSearch } from './useSearch'

describe('useSearch', () => {
  test('returns matching tasks and projects ranked by relevance', async () => {
    const task = makeTask({ title: 'Buy milk' })
    const other = makeTask({ title: 'Call dentist' })
    const store = new FakeStore(buildState({ tasks: [task, other] }))

    const { result } = await renderSuspendedHook(() => useSearch('milk'), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy milk'])
  })

  test('matches a partial word at the end (find-as-you-type)', async () => {
    const task = makeTask({ title: 'Buy groceries' })
    const store = new FakeStore(buildState({ tasks: [task] }))

    const { result } = await renderSuspendedHook(() => useSearch('groc'), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(r => r.kind === 'task' ? r.task.title : undefined)).toEqual(['Buy groceries'])
  })

  test('an empty query returns an empty-but-valid result, never an error', async () => {
    const store = new FakeStore(buildState({ tasks: [makeTask({ title: 'Anything' })] }))

    const { result } = await renderSuspendedHook(() => useSearch(''), { wrapper: makeWrapper(store) })

    expect(result.current).toEqual({ items: [], total: 0, truncated: false })
  })

  test('a whitespace-only query is treated the same as empty', async () => {
    const store = new FakeStore(buildState({ tasks: [makeTask({ title: 'Anything' })] }))

    const { result } = await renderSuspendedHook(() => useSearch('   '), { wrapper: makeWrapper(store) })

    expect(result.current.items).toEqual([])
  })

  test('recomputes live as the query changes across renders, keystroke by keystroke', async () => {
    const task = makeTask({ title: 'Buy groceries' })
    const store = new FakeStore(buildState({ tasks: [task] }))

    let query = 'dent'
    const { result, rerender } = await renderSuspendedHook(() => useSearch(query), { wrapper: makeWrapper(store) })
    expect(result.current.items).toEqual([])

    query = 'groc'
    rerender()
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0]?.kind === 'task' ? result.current.items[0].task.title : undefined).toBe('Buy groceries')
  })

  test('propagates an unresolved sphere name to the ErrorBoundary', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Work' })] }))
    let caught: Error | undefined

    await renderSuspendedHook(() => useSearch('milk', { sphere: 'Nope' }), { wrapper: makeWrapper(store, { onError: e => { caught = e } }) })
    expect(caught?.message).toMatch(/No sphere matching "Nope"/)
  })

  test('limit truncates and reports total/truncated', async () => {
    const tasks = ['Milk one', 'Milk two', 'Milk three'].map(title => makeTask({ title }))
    const store = new FakeStore(buildState({ tasks }))
    const { result } = await renderSuspendedHook(() => useSearch('milk', { limit: 2 }), { wrapper: makeWrapper(store) })
    expect(result.current.total).toBe(3)
    expect(result.current.truncated).toBe(true)
  })
})
