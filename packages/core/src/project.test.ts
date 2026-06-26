import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createProject, archiveProject, unarchiveProject } from './commands.js'
import { listProjects } from './query.js'
import type { SphereId, ProjectId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

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
