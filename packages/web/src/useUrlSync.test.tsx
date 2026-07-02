// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { useUrlSync } from './useUrlSync.js'
import type { Action, View } from 'palimpsest-ui-core'
import type { SphereId, TaskId, ProjectId, AgendaId } from 'palimpsest'

const SPHERE_ID = 'sph1' as SphereId
const AGENDA_ID = 'agenda1' as AgendaId
const PROJECT_ID = 'proj1' as ProjectId

function TestHarness({ view, activeAgendaId, dispatch }: { view: View; activeAgendaId: AgendaId | undefined; dispatch: (action: Action) => void }) {
  useUrlSync({
    view,
    sphereId: SPHERE_ID,
    activeTaskId: undefined as TaskId | undefined,
    activeProjectId: undefined,
    activeAgendaId,
    dispatch,
  })
  return <div />
}

describe('useUrlSync — agenda routes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => { cleanup() })

  it('pushes /:sphereId/agendas/:agendaId when in agenda view', () => {
    const dispatch = vi.fn()
    render(<TestHarness view="agenda" activeAgendaId={AGENDA_ID} dispatch={dispatch} />)
    expect(window.location.pathname).toBe(`/${SPHERE_ID}/agendas/${AGENDA_ID}`)
  })

  it('pushes /:sphereId/agendas when in agendas list view', () => {
    const dispatch = vi.fn()
    render(<TestHarness view="agendas" activeAgendaId={undefined} dispatch={dispatch} />)
    expect(window.location.pathname).toBe(`/${SPHERE_ID}/agendas`)
  })

  it('does not push a path when in agenda view with no activeAgendaId', () => {
    const dispatch = vi.fn()
    render(<TestHarness view="agenda" activeAgendaId={undefined} dispatch={dispatch} />)
    expect(window.location.pathname).toBe('/')
  })

  it('dispatches set-sphere and set-nav for an agenda URL on mount', () => {
    window.history.replaceState(null, '', `/${SPHERE_ID}/agendas/${AGENDA_ID}`)
    const dispatch = vi.fn()
    render(<TestHarness view="dashboard" activeAgendaId={undefined} dispatch={dispatch} />)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-sphere', sphereId: SPHERE_ID })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set-nav',
      navState: { view: 'agenda', selected: 0, activeAgendaId: AGENDA_ID, showCompleted: false },
    })
  })

  it('project URLs are unaffected by the agenda route addition', () => {
    window.history.replaceState(null, '', `/${SPHERE_ID}/projects/${PROJECT_ID}`)
    const dispatch = vi.fn()
    render(<TestHarness view="dashboard" activeAgendaId={undefined} dispatch={dispatch} />)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set-nav',
      navState: { view: 'project', selected: 0, activeProjectId: PROJECT_ID, showCompleted: false },
    })
  })
})
