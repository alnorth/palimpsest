// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeAgenda, makeProject, buildState } from './testFixtures'
import { makeWrapper, renderSuspendedHook, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetProjectAgenda } from './useSetProjectAgenda'
import { useProjects } from './useProjects'

describe('useSetProjectAgenda', () => {
  test('links a project to an agenda', async () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = new RecordingStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setProjectAgenda.mutate({ projectId: project.id, agendaId: agenda.id }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: agenda.id },
    })]])
    await waitFor(() => expect(result.current.projects.items[0]?.agenda).toEqual({ id: agenda.id, name: 'Jim' }))
  })

  test('clears an agenda link when agendaId is null', async () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere, { agendaId: agenda.id })
    const store = new RecordingStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setProjectAgenda.mutate({ projectId: project.id, agendaId: null }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { agendaId: null },
    })]])
    await waitFor(() => expect(result.current.projects.items[0]?.agenda).toBeNull())
  })

  test('surfaces an unknown project id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectAgenda: useSetProjectAgenda(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setProjectAgenda.mutate({ projectId: 'missing', agendaId: null }))
        .rejects.toThrow('Project not found: missing')
    })

    expect(result.current.setProjectAgenda.error?.message).toBe('Project not found: missing')
    expect(store.appended).toEqual([])
  })

  test('selfOnly: true marks a project self-only with no agendaId argument', async () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Launch' })
    const store = new RecordingStore(buildState({ spheres: [sphere], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setProjectAgenda.mutate({ projectId: project.id, selfOnly: true }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { isSelfOnly: true },
    })]])
    await waitFor(() => expect(result.current.projects.items[0]?.isSelfOnly).toBe(true))
  })

  test('rejects a call with both agendaId and selfOnly:true, without appending', async () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere)
    const store = new RecordingStore(buildState({ spheres: [sphere], agendas: [agenda], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      setProjectAgenda: useSetProjectAgenda(),
      projects: useProjects(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setProjectAgenda.mutate({ projectId: project.id, agendaId: agenda.id, selfOnly: true }))
        .rejects.toThrow(/agendaId.*selfOnly/i)
    })

    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectAgenda: useSetProjectAgenda(),
    }), { wrapper: makeWrapper(store) })

    const firstMutate = result.current.setProjectAgenda.mutate
    rerender()

    expect(result.current.setProjectAgenda.mutate).toBe(firstMutate)
  })
})
