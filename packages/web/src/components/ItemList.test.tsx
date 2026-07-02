// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import React from 'react'
import { createEmptyState } from 'palimpsest'
import type { Agenda, AgendaId, SphereId } from 'palimpsest'
import type { ListGroup, ListItem, ProjectStats } from 'palimpsest-ui-core'
import { ItemList } from './ItemList.js'

const EMPTY_STATS: ProjectStats = { hasNext: new Set(), taskCount: new Map() }

function makeAgenda(id: string, title: string): Agenda {
  return { id: id as AgendaId, sphereId: 'sph1' as SphereId, title }
}

function agendaGroup(...agendas: Agenda[]): ListGroup<ListItem> {
  return { title: '', items: agendas.map(agenda => ({ kind: 'agenda' as const, agenda })) }
}

function renderList(groups: ListGroup<ListItem>[], overrides: Partial<React.ComponentProps<typeof ItemList>> = {}) {
  return render(
    <MantineProvider>
      <ItemList
        groups={groups}
        selectedItem={undefined}
        state={createEmptyState()}
        projectStats={EMPTY_STATS}
        showArchived={false}
        {...overrides}
      />
    </MantineProvider>
  )
}

describe('ItemList — agenda rows', () => {
  afterEach(() => { cleanup() })

  it('renders an agenda item title', () => {
    renderList([agendaGroup(makeAgenda('a1', 'Jim'))])
    expect(screen.getByText('Jim')).toBeDefined()
  })

  it('shows the task count from agendaStats', () => {
    const agendaId = 'a1' as AgendaId
    renderList(
      [agendaGroup(makeAgenda('a1', 'Jim'))],
      { agendaStats: new Map([[agendaId, 7]]) },
    )
    expect(screen.getByText('7')).toBeDefined()
  })

  it('defaults to a task count of 0 when agendaStats is not provided', () => {
    renderList([agendaGroup(makeAgenda('a1', 'Jim'))])
    expect(screen.getByText('0')).toBeDefined()
  })

  it('calls onActivate with the flat index when an agenda row is clicked', () => {
    const onActivate = vi.fn()
    renderList(
      [agendaGroup(makeAgenda('a1', 'Jim'), makeAgenda('a2', 'Marcia'))],
      { onActivate },
    )
    fireEvent.click(screen.getByText('Marcia'))
    expect(onActivate).toHaveBeenCalledWith(1)
  })
})
