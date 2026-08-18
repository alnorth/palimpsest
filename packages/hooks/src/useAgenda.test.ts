// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { makeSphere, makeAgenda, makeProject, makeTask, buildState } from './testFixtures'
import { FakeStore, makeWrapper, renderSuspendedHook } from './testHelpers'
import { useAgenda } from './useAgenda'

describe('useAgenda', () => {
  test('returns the agenda, waiting/active tasks, and linked projects', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const project = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const active = makeTask({ sphereId: sphere.id, title: 'Active', agendaId: agenda.id })
    const waiting = makeTask({ sphereId: sphere.id, title: 'Waiting', agendaId: agenda.id, waitingFor: { kind: 'review' } })
    const store = new FakeStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project], tasks: [active, waiting] }))

    const { result } = await renderSuspendedHook(() => useAgenda('Han'), { wrapper: makeWrapper(store) })

    expect(result.current.agenda.name).toBe('Han')
    expect(result.current.activeTasks.map(t => t.title)).toEqual(['Active'])
    expect(result.current.waitingTasks.map(t => t.title)).toEqual(['Waiting'])
    expect(result.current.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('surfaces an unresolved agenda name to the ErrorBoundary', async () => {
    const store = new FakeStore(buildState({}))
    let caught: Error | undefined

    await renderSuspendedHook(() => useAgenda('Nope'), { wrapper: makeWrapper(store, { onError: e => { caught = e } }) })

    expect(caught?.message).toMatch(/No agenda matching "Nope"/)
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

    const { result } = await renderSuspendedHook(() => useAgenda('Reviews', 'Work'), { wrapper: makeWrapper(store) })

    expect(result.current.agenda.sphere?.name).toBe('Work')
    expect(result.current.activeTasks.map(t => t.title)).toEqual(['Work task'])
  })
})
