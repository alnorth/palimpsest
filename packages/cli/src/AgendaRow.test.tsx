import React from 'react'
import { describe, test, expect } from 'vitest'
import { renderToString } from 'ink'
import type { Agenda, AgendaId, SphereId } from 'palimpsest'
import { AgendaRow } from './AgendaRow.js'
import { lines } from './testUtils.js'

function makeAgenda(overrides: Partial<Agenda> = {}): Agenda {
  return {
    id: 'agenda1' as AgendaId,
    sphereId: 'sph1' as SphereId,
    title: 'Jim',
    ...overrides,
  }
}

function render(agenda: Agenda, opts: { isSelected?: boolean; taskCount?: number } = {}) {
  const { isSelected = false, taskCount = 0 } = opts
  return renderToString(
    <AgendaRow agenda={agenda} isSelected={isSelected} taskCount={taskCount} />,
    { columns: 80 }
  )
}

describe('AgendaRow', () => {
  test('renders agenda title', () => {
    const output = render(makeAgenda())
    expect(lines(output)[0]).toContain('Jim')
  })

  test('unselected shows double-space prefix', () => {
    const output = render(makeAgenda())
    expect(lines(output)[0]).toMatch(/^  /)
  })

  test('selected shows > prefix', () => {
    const output = render(makeAgenda(), { isSelected: true })
    expect(lines(output)[0]).toMatch(/^> /)
  })

  test('taskCount shown in output', () => {
    const output = render(makeAgenda(), { taskCount: 5 })
    expect(lines(output).join('\n')).toContain('5')
  })

  test('shortcut key shown when agenda has one', () => {
    const output = render(makeAgenda({ title: 'Jim', key: 'x' }))
    expect(lines(output)[0]).toBe('  Jim  x · 0')
  })

  test('no shortcut key segment when agenda has none', () => {
    const output = render(makeAgenda({ title: 'Jim' }))
    expect(lines(output)[0]).toBe('  Jim · 0')
  })
})
