// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { makeSphere, makeAgenda, makeProject, buildState } from './testFixtures'
import { makeWrapper, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetProjectAgenda } from './useSetProjectAgenda'
import { useProjects } from './useProjects'

describe('useSetProjectAgenda', () => {
  test('links a project to an agenda', async () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = new RecordingStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const { result } = renderHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.projects.isLoading).toBe(false))

    await act(async () => { await result.current.setProjectAgenda.mutate({ projectId: project.id, agendaId: agenda.id }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: agenda.id },
    })]])
    await waitFor(() => expect(result.current.projects.data?.[0]?.agenda).toEqual({ id: agenda.id, name: 'Jim' }))
  })

  test('clears an agenda link when agendaId is null', async () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere, { agendaId: agenda.id })
    const store = new RecordingStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const { result } = renderHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.projects.isLoading).toBe(false))

    await act(async () => { await result.current.setProjectAgenda.mutate({ projectId: project.id, agendaId: null }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: null },
    })]])
    await waitFor(() => expect(result.current.projects.data?.[0]?.agenda).toBeNull())
  })

  test('surfaces an unknown project id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectAgenda: useSetProjectAgenda(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    await act(async () => {
      await expect(result.current.setProjectAgenda.mutate({ projectId: 'missing', agendaId: null }))
        .rejects.toThrow('Project not found: missing')
    })

    expect(result.current.setProjectAgenda.error?.message).toBe('Project not found: missing')
    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = renderHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectAgenda: useSetProjectAgenda(),
    }), { wrapper: makeWrapper(store) })
    await waitFor(() => expect(result.current.ctx.isLoading).toBe(false))

    const firstMutate = result.current.setProjectAgenda.mutate
    rerender()

    expect(result.current.setProjectAgenda.mutate).toBe(firstMutate)
  })
})
