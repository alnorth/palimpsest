// @vitest-environment jsdom
import { describe, test, expect } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { makeSphere, makeAgenda, makeProject, buildState } from './testFixtures'
import { makeWrapper, renderSuspendedHook, RecordingStore } from './testHelpers'
import { usePalimpsestContext } from './PalimpsestProvider'
import { useSetProjectSphere } from './useSetProjectSphere'
import { useProject } from './useProject'

describe('useSetProjectSphere', () => {
  test('moves a project to a different sphere', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const project = makeProject(sphere, { name: 'Launch' })
    const store = new RecordingStore(buildState({ spheres: [sphere, otherSphere], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      setProjectSphere: useSetProjectSphere(),
      project: useProject(project.id),
    }), { wrapper: makeWrapper(store) })

    await act(async () => { await result.current.setProjectSphere.mutate({ projectId: project.id, sphereId: otherSphere.id }) })

    expect(store.appended).toEqual([[expect.objectContaining({
      type: 'project.updated', projectId: project.id, patch: { sphereId: otherSphere.id },
    })]])
    await waitFor(() => expect(result.current.project.sphere).toEqual({ id: otherSphere.id, name: 'Personal' }))
  })

  test('surfaces an unknown project id as error, and never appends', async () => {
    const store = new RecordingStore(buildState({}))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectSphere: useSetProjectSphere(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setProjectSphere.mutate({ projectId: 'missing', sphereId: 'sph-1' }))
        .rejects.toThrow('Project not found: missing')
    })

    expect(result.current.setProjectSphere.error?.message).toBe('Project not found: missing')
    expect(store.appended).toEqual([])
  })

  test('a cross-sphere agenda-link violation surfaces as an error, and never appends', async () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere, { agendaId: agenda.id })
    const store = new RecordingStore(buildState({ spheres: [sphere, otherSphere], agendas: [agenda], projects: [project] }))

    const { result } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectSphere: useSetProjectSphere(),
    }), { wrapper: makeWrapper(store) })

    await act(async () => {
      await expect(result.current.setProjectSphere.mutate({ projectId: project.id, sphereId: otherSphere.id }))
        .rejects.toThrow(/different sphere/)
    })

    expect(store.appended).toEqual([])
  })

  test('mutate keeps a stable identity across re-renders when store and projState are unchanged', async () => {
    const store = new RecordingStore(buildState({}))

    const { result, rerender } = await renderSuspendedHook(() => ({
      ctx: usePalimpsestContext(),
      setProjectSphere: useSetProjectSphere(),
    }), { wrapper: makeWrapper(store) })

    const firstMutate = result.current.setProjectSphere.mutate
    rerender()

    expect(result.current.setProjectSphere.mutate).toBe(firstMutate)
  })
})
