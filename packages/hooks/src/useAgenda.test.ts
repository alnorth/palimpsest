// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeAgenda, makeProject, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper } from './testHelpers'
import { useAgenda } from './useAgenda'

describe('useAgenda', () => {
  test('returns the agenda, waiting/active tasks, and linked projects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const project = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const active = makeTask({ sphereId: sphere.id, title: 'Active', agendaId: agenda.id })
    const waiting = makeTask({ sphereId: sphere.id, title: 'Waiting', agendaId: agenda.id, waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project], tasks: [active, waiting] }))

    const { result } = renderHook(() => useAgenda('Han'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data?.agenda.name).toBe('Han')
    expect(result.current.data?.activeTasks.map(t => t.title)).toEqual(['Active'])
    expect(result.current.data?.waitingTasks.map(t => t.title)).toEqual(['Waiting'])
    expect(result.current.data?.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('surfaces an unresolved agenda name as an error', async () => {
    const store = new FakeStore(buildState({}))

    const { result } = renderHook(() => useAgenda('Nope'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error?.message).toMatch(/No agenda matching "Nope"/)
  })

  test('uses the sphere argument to disambiguate an agenda name shared across spheres', async () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workAgenda = makeAgenda(work, { title: 'Reviews' })
    const personalAgenda = makeAgenda(personal, { title: 'Reviews' })
    const workTask = makeTask({ sphereId: work.id, title: 'Work task', agendaId: workAgenda.id })
    const personalTask = makeTask({ sphereId: personal.id, title: 'Personal task', agendaId: personalAgenda.id })
    const store = new FakeStore(buildState({
      spheres: [work, personal],
      agendas: [workAgenda, personalAgenda],
      tasks: [workTask, personalTask],
    }))

    const { result } = renderHook(() => useAgenda('Reviews', 'Work'), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data?.agenda.sphere?.name).toBe('Work')
    expect(result.current.data?.activeTasks.map(t => t.title)).toEqual(['Work task'])
  })
})
