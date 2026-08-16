import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection'
import { buildStateFromConfig } from './config'
import { createProject, archiveProject, unarchiveProject, updateProject } from './commands'
import { listProjects } from './query'
import type { SphereId, ProjectId, AgendaId } from './ids'

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

function setup() {
  const projEvts = createProject({ sphereId, name: 'Project A' })
  const s1 = project(projEvts, baseState)
  const projectId = (projEvts[0] as any).projectId as ProjectId
  const proj = s1.projects.get(projectId)!
  return { projEvts, s1, projectId, proj }
}

describe('archiveProject', () => {
  it('sets isArchived and archivedAt', () => {
    const { projEvts, proj, projectId } = setup()
    const archiveEvts = archiveProject(proj)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    const p = s2.projects.get(projectId)
    expect(p?.isArchived).toBe(true)
    expect(p?.archivedAt).toBeDefined()
  })

  it('throws if project is already archived', () => {
    const { projEvts, proj } = setup()
    const archiveEvts = archiveProject(proj)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    const archivedProj = s2.projects.get(proj.id)!
    expect(() => archiveProject(archivedProj)).toThrow('already archived')
  })
})

describe('unarchiveProject', () => {
  it('clears isArchived and archivedAt', () => {
    const { projEvts, proj, projectId } = setup()
    const archiveEvts = archiveProject(proj)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    const archivedProj = s2.projects.get(projectId)!
    const unarchiveEvts = unarchiveProject(archivedProj)
    const s3 = project([...projEvts, ...archiveEvts, ...unarchiveEvts], baseState)
    expect(s3.projects.get(projectId)?.isArchived).toBeUndefined()
    expect(s3.projects.get(projectId)?.archivedAt).toBeUndefined()
  })

  it('throws if project is not archived', () => {
    const { proj } = setup()
    expect(() => unarchiveProject(proj)).toThrow('not archived')
  })
})

describe('Project.agendaId', () => {
  it('createProject sets agendaId when provided', () => {
    const evts = createProject({ sphereId, name: 'Shared project', agendaId })
    const state = project(evts, baseState)
    const projectId = (evts[0] as any).projectId as ProjectId
    expect(state.projects.get(projectId)?.agendaId).toBe(agendaId)
  })

  it('createProject leaves agendaId unset when omitted', () => {
    const { proj } = setup()
    expect(proj.agendaId).toBeUndefined()
  })

  it('updateProject sets agendaId via patch', () => {
    const { projEvts, proj, projectId } = setup()
    const updateEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...updateEvts], baseState)
    expect(s2.projects.get(projectId)?.agendaId).toBe(agendaId)
  })

  it('updateProject clears agendaId via CLEAR sentinel', () => {
    const { projEvts, proj, projectId } = setup()
    const setEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...setEvts], baseState)
    const linkedProj = s2.projects.get(projectId)!
    const clearEvts = updateProject(linkedProj, { agendaId: null })
    const s3 = project([...projEvts, ...setEvts, ...clearEvts], baseState)
    expect(s3.projects.get(projectId)?.agendaId).toBeUndefined()
  })
})

describe('listProjects with agendaId filter', () => {
  it('filters by agendaId', () => {
    const { projEvts, proj, projectId } = setup()
    const linkEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...linkEvts], baseState)
    expect(listProjects(s2, { agendaId }).map(p => p.id)).toContain(projectId)
    expect(listProjects(s2, { agendaId: 'other' as AgendaId })).toHaveLength(0)
  })

  it('filters by hasAgenda', () => {
    const { projEvts, proj, projectId } = setup()
    const linkEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...linkEvts], baseState)
    expect(listProjects(s2, { hasAgenda: true }).map(p => p.id)).toContain(projectId)
    expect(listProjects(s2, { hasAgenda: false }).map(p => p.id)).not.toContain(projectId)
  })
})

describe('listProjects with isArchived filter', () => {
  it('returns only active projects when isArchived is false', () => {
    const { projEvts, proj } = setup()
    const archiveEvts = archiveProject(proj)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    expect(listProjects(s2, { isArchived: false })).toHaveLength(0)
  })

  it('returns only archived projects when isArchived is true', () => {
    const { projEvts, proj, projectId } = setup()
    const archiveEvts = archiveProject(proj)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    expect(listProjects(s2, { isArchived: true }).map(p => p.id)).toContain(projectId)
  })
})
