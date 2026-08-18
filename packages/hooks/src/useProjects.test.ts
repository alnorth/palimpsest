// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeProject, makeTask, makeAgenda, makeContext, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
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

    const { result } = await renderSuspendedHook(() => useProjects({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    expect(result.current.items).toEqual([expect.objectContaining({ name: 'Launch', hasNextAction: true })])
  })

  test('agenda/hasAgenda/withoutAgenda filters pass through', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const store = new FakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [linked, unlinked] }))

    const byAgenda = await renderSuspendedHook(() => useProjects({ agenda: 'Jim' }), { wrapper: makeWrapper(store) })
    expect(byAgenda.result.current.items.map(p => p.name)).toEqual(['Shared'])

    const withAgenda = await renderSuspendedHook(() => useProjects({ hasAgenda: true }), { wrapper: makeWrapper(store) })
    expect(withAgenda.result.current.items.map(p => p.name)).toEqual(['Shared'])

    const withoutAgenda = await renderSuspendedHook(() => useProjects({ withoutAgenda: true }), { wrapper: makeWrapper(store) })
    expect(withoutAgenda.result.current.items.map(p => p.name)).toEqual(['Solo'])
  })

  test('isSelfOnly filter passes through', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const selfOnly = makeProject(sphere, { name: 'Personal', isSelfOnly: true })
    const other = makeProject(sphere, { name: 'Other' })
    const store = new FakeStore(buildState({ spheres: [sphere], projects: [selfOnly, other] }))

    const { result } = await renderSuspendedHook(() => useProjects({ isSelfOnly: true }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(p => p.name)).toEqual(['Personal'])
  })

  test('includeNextTasks includes each project\'s open next-action tasks', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Launch' })
    const task = makeTask({ projectId: project.id, isNext: true, title: 'Ship it' })
    const store = new FakeStore(buildState({ spheres: [sphere], projects: [project], tasks: [task] }))

    const { result } = await renderSuspendedHook(() => useProjects({ sphere: 'Work', includeNextTasks: true }), { wrapper: makeWrapper(store) })
    expect(result.current.items[0]?.nextTasks?.map(t => t.title)).toEqual(['Ship it'])
  })
})

describe('useSpheres', () => {
  test('returns spheres sorted by name', async () => {
    const store = new FakeStore(buildState({ spheres: [makeSphere({ name: 'Zeta' }), makeSphere({ name: 'Alpha' })] }))
    const { result } = await renderSuspendedHook(() => useSpheres(), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(s => s.name)).toEqual(['Alpha', 'Zeta'])
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
    const { result } = await renderSuspendedHook(() => useAgendas({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(a => a.name)).toEqual(['Standup'])
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
    const { result } = await renderSuspendedHook(() => useContexts({ sphere: 'Work' }), { wrapper: makeWrapper(store) })
    expect(result.current.items.map(c => c.name)).toEqual(['@errand'])
  })
})
