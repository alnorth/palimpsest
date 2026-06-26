import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createTask } from './commands.js'
import { getAgenda, listAgendas, listTasksByAgenda } from './query.js'
import type { SphereId, AgendaId } from './ids.js'

const sphereId = 'sph1' as SphereId
const agendaId = 'ag1' as AgendaId

const baseState = {
  ...createEmptyState(),
  ...buildStateFromConfig([{
    id: sphereId,
    name: 'Work',
    agendas: [{ id: agendaId, title: 'Weekly Review' }],
    contexts: [],
  }]),
}

describe('listAgendas', () => {
  it('filters by sphereId', () => {
    expect(listAgendas(baseState, { sphereId }).map(a => a.id)).toContain(agendaId)
    expect(listAgendas(baseState, { sphereId: 'other' as SphereId })).toHaveLength(0)
  })
})

describe('getAgenda', () => {
  it('returns the agenda by id', () => {
    const agenda = getAgenda(baseState, agendaId)
    expect(agenda?.title).toBe('Weekly Review')
    expect(agenda?.sphereId).toBe(sphereId)
  })

  it('returns undefined for unknown id', () => {
    expect(getAgenda(baseState, 'nope' as AgendaId)).toBeUndefined()
  })
})

describe('task agendaId', () => {
  it('creates a task linked to an agenda', () => {
    const taskEvts = createTask(baseState, { title: 'Prepare slides', sphereId, agendaId })
    const state = project(taskEvts, baseState)
    expect(listTasksByAgenda(state, agendaId)).toHaveLength(1)
    expect(listTasksByAgenda(state, agendaId)[0]?.title).toBe('Prepare slides')
  })

  it('throws if agenda does not exist when creating a task', () => {
    expect(() =>
      createTask(baseState, { title: 'T', sphereId, agendaId: 'nope' as AgendaId })
    ).toThrow('Agenda not found')
  })
})
