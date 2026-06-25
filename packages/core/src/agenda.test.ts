import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { createSphere, createAgenda, updateAgenda, deleteAgenda, createTask } from './commands.js'
import { getAgenda, listAgendas, listTasksByAgenda } from './query.js'
import type { SphereId, AgendaId } from './ids.js'
import type { PalimpsestEvent } from './events.js'

function setup() {
  const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
  const s1 = project(sphereEvts)
  const sphereId = (sphereEvts[0] as any).sphereId as SphereId

  const agendaEvts = createAgenda(s1, { sphereId, title: 'Weekly Review' })
  const s2 = project([...sphereEvts, ...agendaEvts])
  const agendaId = (agendaEvts[0] as any).agendaId as AgendaId

  return { sphereEvts, agendaEvts, s2, sphereId, agendaId }
}

describe('createAgenda', () => {
  it('throws if sphere does not exist', () => {
    expect(() =>
      createAgenda(createEmptyState(), { sphereId: 'nope' as SphereId, title: 'Test' })
    ).toThrow('Sphere not found')
  })

  it('creates an agenda with the correct fields', () => {
    const { s2, agendaId, sphereId } = setup()
    const agenda = getAgenda(s2, agendaId)
    expect(agenda?.title).toBe('Weekly Review')
    expect(agenda?.sphereId).toBe(sphereId)
  })
})

describe('updateAgenda', () => {
  it('updates the title', () => {
    const { sphereEvts, agendaEvts, s2, agendaId } = setup()
    const updateEvts = updateAgenda(s2, agendaId, { title: 'Monthly Review' })
    const s3 = project([...sphereEvts, ...agendaEvts, ...updateEvts])
    expect(getAgenda(s3, agendaId)?.title).toBe('Monthly Review')
  })

  it('throws if agenda does not exist', () => {
    expect(() =>
      updateAgenda(createEmptyState(), 'nope' as AgendaId, { title: 'X' })
    ).toThrow('Agenda not found')
  })
})

describe('deleteAgenda', () => {
  it('removes the agenda', () => {
    const { sphereEvts, agendaEvts, s2, agendaId } = setup()
    const delEvts = deleteAgenda(s2, agendaId)
    const s3 = project([...sphereEvts, ...agendaEvts, ...delEvts])
    expect(getAgenda(s3, agendaId)).toBeUndefined()
  })
})

describe('listAgendas', () => {
  it('filters by sphereId', () => {
    const { sphereEvts, agendaEvts, s2, sphereId, agendaId } = setup()
    expect(listAgendas(s2, { sphereId }).map(a => a.id)).toContain(agendaId)
    expect(listAgendas(s2, { sphereId: 'other' as SphereId })).toHaveLength(0)
  })
})

describe('task agendaId', () => {
  it('creates a task linked to an agenda', () => {
    const { sphereEvts, agendaEvts, s2, sphereId, agendaId } = setup()
    const taskEvts = createTask(s2, { title: 'Prepare slides', sphereId, agendaId })
    const s3 = project([...sphereEvts, ...agendaEvts, ...taskEvts])
    expect(listTasksByAgenda(s3, agendaId)).toHaveLength(1)
    expect(listTasksByAgenda(s3, agendaId)[0]?.title).toBe('Prepare slides')
  })

  it('throws if agenda does not exist when creating a task', () => {
    const { s2, sphereId } = setup()
    expect(() =>
      createTask(s2, { title: 'T', sphereId, agendaId: 'nope' as AgendaId })
    ).toThrow('Agenda not found')
  })
})
