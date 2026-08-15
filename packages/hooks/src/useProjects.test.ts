// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeProject, makeTask, makeAgenda, makeContext, buildState } from './testFixtures'
import { FakeStore, makeWrapper } from './testHelpers'
import { useProjects } from './useProjects'
import { useSpheres } from './useSpheres'
import { useAgendas } from './useAgendas'
import { useContexts } from './useContexts'

describe('useProjects', () => {
  test('returns projects with computed stats', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true })
    const store = new FakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const { result } = renderHook(() => useProjects({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([expect.objectContaining({ name: 'Launch', hasNextAction: true })])
  })

  test('agenda/hasAgenda/withoutAgenda filters pass through', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const store = new FakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [linked, unlinked] }))

    const byAgenda = renderHook(() => useProjects({ agenda: 'Jim' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(byAgenda.result.current.isLoading).toBe(false))
    expect(byAgenda.result.current.data?.map(p => p.name)).toEqual(['Shared'])

    const withAgenda = renderHook(() => useProjects({ hasAgenda: true }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(withAgenda.result.current.isLoading).toBe(false))
    expect(withAgenda.result.current.data?.map(p => p.name)).toEqual(['Shared'])

    const withoutAgenda = renderHook(() => useProjects({ withoutAgenda: true }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(withoutAgenda.result.current.isLoading).toBe(false))
    expect(withoutAgenda.result.current.data?.map(p => p.name)).toEqual(['Solo'])
  })
})

describe('useSpheres', () => {
  test('returns spheres sorted by name', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Zeta' }), makeSphere({ name: 'Alpha' })] }))
    const { result } = renderHook(() => useSpheres(), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(s => s.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('useAgendas', () => {
  test('scopes agendas to a sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const other = makeSphere({ name: 'Home' })
    const store = new FakeStore(buildState({
      spheres: [sphere, other],
      agendas: [makeAgenda(sphere, { title: 'Standup' }), makeAgenda(other, { title: 'Chores' })],
    }))
    const { result } = renderHook(() => useAgendas({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(a => a.name)).toEqual(['Standup'])
  })
})

describe('useContexts', () => {
  test('scopes contexts to a sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const other = makeSphere({ name: 'Home' })
    const store = new FakeStore(buildState({
      spheres: [sphere, other],
      contexts: [makeContext(sphere, { name: '@errand' }), makeContext(other, { name: '@home' })],
    }))
    const { result } = renderHook(() => useContexts({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map(c => c.name)).toEqual(['@errand'])
  })
})
