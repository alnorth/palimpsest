// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeProject, makeTask, makeAgenda, makeContext, buildState } from './testFixtures.js'
import { FakeStore, makeWrapper } from './testHelpers.js'
import { useProjects } from './useProjects.js'
import { useSpheres } from './useSpheres.js'
import { useAgendas } from './useAgendas.js'
import { useContexts } from './useContexts.js'

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
