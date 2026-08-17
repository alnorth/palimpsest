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

describe('Project.isSelfOnly', () => {
  it('createProject leaves isSelfOnly unset by default', () => {
    const { proj } = setup()
    expect(proj.isSelfOnly).toBeUndefined()
  })

  it('updateProject sets isSelfOnly via patch', () => {
    const { projEvts, proj, projectId } = setup()
    const updateEvts = updateProject(proj, { isSelfOnly: true })
    const s2 = project([...projEvts, ...updateEvts], baseState)
    expect(s2.projects.get(projectId)?.isSelfOnly).toBe(true)
  })

  it('updateProject clears isSelfOnly by setting false', () => {
    const { projEvts, proj, projectId } = setup()
    const setEvts = updateProject(proj, { isSelfOnly: true })
    const s2 = project([...projEvts, ...setEvts], baseState)
    const selfOnlyProj = s2.projects.get(projectId)!
    const clearEvts = updateProject(selfOnlyProj, { isSelfOnly: false })
    const s3 = project([...projEvts, ...setEvts, ...clearEvts], baseState)
    expect(s3.projects.get(projectId)?.isSelfOnly).toBeUndefined()
  })

  it('throws when agendaId and isSelfOnly are both set in the same patch', () => {
    const { proj } = setup()
    expect(() => updateProject(proj, { agendaId, isSelfOnly: true }))
      .toThrow('cannot have both agendaId and isSelfOnly set')
  })

  it('throws when isSelfOnly is set true while the project already has an agendaId (effective-value case)', () => {
    const { projEvts, proj, projectId } = setup()
    const linkEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...linkEvts], baseState)
    const linkedProj = s2.projects.get(projectId)!
    expect(() => updateProject(linkedProj, { isSelfOnly: true }))
      .toThrow('cannot have both agendaId and isSelfOnly set')
  })

  it('throws when agendaId is set while the project is already self-only (effective-value case)', () => {
    const { projEvts, proj, projectId } = setup()
    const selfEvts = updateProject(proj, { isSelfOnly: true })
    const s2 = project([...projEvts, ...selfEvts], baseState)
    const selfOnlyProj = s2.projects.get(projectId)!
    expect(() => updateProject(selfOnlyProj, { agendaId }))
      .toThrow('cannot have both agendaId and isSelfOnly set')
  })

  it('allows switching from self-only to a real agenda link when isSelfOnly is explicitly cleared in the same patch', () => {
    const { projEvts, proj, projectId } = setup()
    const selfEvts = updateProject(proj, { isSelfOnly: true })
    const s2 = project([...projEvts, ...selfEvts], baseState)
    const selfOnlyProj = s2.projects.get(projectId)!
    const switchEvts = updateProject(selfOnlyProj, { agendaId, isSelfOnly: false })
    const s3 = project([...projEvts, ...selfEvts, ...switchEvts], baseState)
    expect(s3.projects.get(projectId)?.agendaId).toBe(agendaId)
    expect(s3.projects.get(projectId)?.isSelfOnly).toBeUndefined()
  })

  it('allows switching from a real agenda link to self-only when agendaId is explicitly cleared in the same patch', () => {
    const { projEvts, proj, projectId } = setup()
    const linkEvts = updateProject(proj, { agendaId })
    const s2 = project([...projEvts, ...linkEvts], baseState)
    const linkedProj = s2.projects.get(projectId)!
    const switchEvts = updateProject(linkedProj, { agendaId: null, isSelfOnly: true })
    const s3 = project([...projEvts, ...linkEvts, ...switchEvts], baseState)
    expect(s3.projects.get(projectId)?.agendaId).toBeUndefined()
    expect(s3.projects.get(projectId)?.isSelfOnly).toBe(true)
  })
})

describe('listProjects with isSelfOnly filter', () => {
  it('filters by isSelfOnly', () => {
    const { projEvts, proj, projectId } = setup()
    const selfEvts = updateProject(proj, { isSelfOnly: true })
    const s2 = project([...projEvts, ...selfEvts], baseState)
    expect(listProjects(s2, { isSelfOnly: true }).map(p => p.id)).toContain(projectId)
    expect(listProjects(s2, { isSelfOnly: false }).map(p => p.id)).not.toContain(projectId)
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
