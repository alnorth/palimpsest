// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppState } from './useAppState.js'
import { PalimpsestStore } from 'palimpsest'
import { createEmptyState, buildStateFromConfig } from 'palimpsest'
import type { ProjectionState, SphereId, AgendaId, PalimpsestEvent, TaskCreatedEvent } from 'palimpsest'

const SPHERE_ID = 'sph1' as SphereId
const AGENDA_ID = 'agenda1' as AgendaId

const initialState: ProjectionState = {
  ...createEmptyState(),
  ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [{ id: AGENDA_ID, title: 'Jim' }], contexts: [] }]),
}

class FakeStore extends PalimpsestStore {
  appended: PalimpsestEvent[] = []
  override async getState(): Promise<ProjectionState> { return initialState }
  override async readAllEvents() { return [] }
  protected override async doAppend(events: PalimpsestEvent[]) { this.appended.push(...events) }
  override async init() {}
  override start() {}
  override stop() {}
}

describe('useAppState — agenda view', () => {
  it('activate() on a kind:"agenda" item navigates to the agenda view', () => {
    const store = new FakeStore()
    const { result } = renderHook(() => useAppState(store, initialState))

    act(() => {
      result.current.dispatch({ type: 'set-nav', navState: { view: 'agendas', selected: 0 } })
    })
    expect(result.current.view).toBe('agendas')
    expect(result.current.listItems.items).toHaveLength(1)

    act(() => {
      result.current.activate(0)
    })

    expect(result.current.view).toBe('agenda')
    expect(result.current.activeAgenda?.id).toBe(AGENDA_ID)
  })

  it('create-task threads a supplied agendaId through to the created event', async () => {
    // The CLI/web layer computes agendaId from the active nav view (mirroring
    // how they already compute projectId from view === 'project') and passes
    // it in the dispatched action; useAppState's job is just to forward it.
    const store = new FakeStore()
    const { result } = renderHook(() => useAppState(store, initialState))

    await act(async () => {
      result.current.dispatch({ type: 'create-task', title: 'Buy Jim a gift', agendaId: AGENDA_ID })
      await Promise.resolve()
    })

    const created = store.appended.find((e): e is TaskCreatedEvent => e.type === 'task.created')
    expect(created).toBeDefined()
    expect(created?.agendaId).toBe(AGENDA_ID)
  })

  it('create-task without an agendaId does not set one', async () => {
    const store = new FakeStore()
    const { result } = renderHook(() => useAppState(store, initialState))

    await act(async () => {
      result.current.dispatch({ type: 'create-task', title: 'Buy milk' })
      await Promise.resolve()
    })

    const created = store.appended.find((e): e is TaskCreatedEvent => e.type === 'task.created')
    expect(created).toBeDefined()
    expect(created?.agendaId).toBeUndefined()
  })
})
