// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import React from 'react'
import type { Sphere, Agenda, SphereId, AgendaId } from 'palimpsest'
import { NavDrawer } from './NavDrawer.js'

const SPHERE: Sphere = { id: 'sph1' as SphereId, name: 'Work' }
const AGENDA_1: Agenda = { id: 'agenda1' as AgendaId, sphereId: SPHERE.id, title: 'Jim', key: 'j' }
const AGENDA_2: Agenda = { id: 'agenda2' as AgendaId, sphereId: SPHERE.id, title: 'Marcia', key: 'm' }

function renderDrawer(overrides: Partial<React.ComponentProps<typeof NavDrawer>> = {}) {
  return render(
    <MantineProvider>
      <NavDrawer
        opened
        onClose={vi.fn()}
        spheres={[SPHERE]}
        activeSphere={SPHERE}
        currentView="dashboard"
        agendas={[AGENDA_1, AGENDA_2]}
        activeAgendaId={undefined}
        dispatch={vi.fn()}
        onLogout={vi.fn()}
        {...overrides}
      />
    </MantineProvider>
  )
}

describe('NavDrawer — Agendas section', () => {
  afterEach(() => { cleanup() })

  it('renders an "Agendas" section heading distinct from the "Agendas" view link', () => {
    // "Agendas" also appears once already as a top-level view link (VIEW_CONFIG);
    // the new section heading is a second, separate occurrence.
    renderDrawer()
    expect(screen.getAllByText('Agendas')).toHaveLength(2)
  })

  it('renders each agenda title', () => {
    renderDrawer()
    expect(screen.getByText('Jim')).toBeDefined()
    expect(screen.getByText('Marcia')).toBeDefined()
  })

  it('renders the agenda shortcut key hint', () => {
    renderDrawer()
    expect(screen.getByText('j')).toBeDefined()
    expect(screen.getByText('m')).toBeDefined()
  })

  it('does not render the extra "Agendas" section heading when there are no agendas', () => {
    // Only the top-level view link remains; the section heading is gone.
    renderDrawer({ agendas: [] })
    expect(screen.getAllByText('Agendas')).toHaveLength(1)
  })

  it('clicking an agenda dispatches navigate to the agenda view and closes the drawer', () => {
    const dispatch = vi.fn()
    const onClose = vi.fn()
    renderDrawer({ dispatch, onClose })
    fireEvent.click(screen.getByText('Jim'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'navigate',
      navState: { view: 'agenda', selected: 0, activeAgendaId: AGENDA_1.id, showCompleted: false },
    })
    expect(onClose).toHaveBeenCalled()
  })
})
