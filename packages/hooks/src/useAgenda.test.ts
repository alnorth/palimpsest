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
})
