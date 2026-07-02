// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import React from 'react'
import type { Agenda, AgendaId, SphereId } from 'palimpsest'
import { AgendaRow } from './AgendaRow.js'

const AGENDA: Agenda = { id: 'agenda1' as AgendaId, sphereId: 'sph1' as SphereId, title: 'Jim' }

function renderRow(overrides: Partial<React.ComponentProps<typeof AgendaRow>> = {}) {
  return render(
    <MantineProvider>
      <AgendaRow agenda={AGENDA} flatIndex={0} isSelected={false} isMobile={false} taskCount={0} {...overrides} />
    </MantineProvider>
  )
}

describe('AgendaRow', () => {
  afterEach(() => { cleanup() })

  it('renders the agenda title', () => {
    renderRow()
    expect(screen.getByText('Jim')).toBeDefined()
  })

  it('renders the task count', () => {
    renderRow({ taskCount: 5 })
    expect(screen.getByText('5')).toBeDefined()
  })

  it('calls onHover with flatIndex on mouse enter', () => {
    const onHover = vi.fn()
    renderRow({ flatIndex: 3, onHover })
    fireEvent.mouseEnter(screen.getByText('Jim'))
    expect(onHover).toHaveBeenCalledWith(3)
  })

  it('calls onActivate with flatIndex on click', () => {
    const onActivate = vi.fn()
    renderRow({ flatIndex: 2, onActivate })
    fireEvent.click(screen.getByText('Jim'))
    expect(onActivate).toHaveBeenCalledWith(2)
  })

  it('renders the shortcut key hint when the agenda has one', () => {
    renderRow({ agenda: { ...AGENDA, key: 'j' } })
    expect(screen.getByText('j')).toBeDefined()
  })

  it('renders no key hint when the agenda has none', () => {
    renderRow()
    expect(screen.queryByText('j')).toBeNull()
  })
})
