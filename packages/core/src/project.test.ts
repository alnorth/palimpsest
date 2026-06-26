import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createProject, archiveProject, unarchiveProject } from './commands.js'
import { listProjects } from './query.js'
import type { SphereId, ProjectId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function setup() {
  const projEvts = createProject(baseState, { sphereId, name: 'Project A' })
  const s1 = project(projEvts, baseState)
  const projectId = (projEvts[0] as any).projectId as ProjectId
  return { projEvts, s1, projectId }
}

describe('archiveProject', () => {
  it('sets isArchived and archivedAt', () => {
    const { projEvts, s1, projectId } = setup()
    const archiveEvts = archiveProject(s1, projectId)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    const p = s2.projects.get(projectId)
    expect(p?.isArchived).toBe(true)
    expect(p?.archivedAt).toBeDefined()
  })

  it('throws if project is already archived', () => {
    const { projEvts, s1, projectId } = setup()
    const archiveEvts = archiveProject(s1, projectId)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    expect(() => archiveProject(s2, projectId)).toThrow('already archived')
  })

  it('throws if project does not exist', () => {
    expect(() => archiveProject(createEmptyState(), 'nope' as ProjectId)).toThrow('Project not found')
  })
})

describe('unarchiveProject', () => {
  it('clears isArchived and archivedAt', () => {
    const { projEvts, s1, projectId } = setup()
    const archiveEvts = archiveProject(s1, projectId)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    const unarchiveEvts = unarchiveProject(s2, projectId)
    const s3 = project([...projEvts, ...archiveEvts, ...unarchiveEvts], baseState)
    expect(s3.projects.get(projectId)?.isArchived).toBeUndefined()
    expect(s3.projects.get(projectId)?.archivedAt).toBeUndefined()
  })

  it('throws if project is not archived', () => {
    const { s1, projectId } = setup()
    expect(() => unarchiveProject(s1, projectId)).toThrow('not archived')
  })
})

describe('listProjects with isArchived filter', () => {
  it('returns only active projects when isArchived is false', () => {
    const { projEvts, s1, projectId } = setup()
    const archiveEvts = archiveProject(s1, projectId)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    expect(listProjects(s2, { isArchived: false })).toHaveLength(0)
  })

  it('returns only archived projects when isArchived is true', () => {
    const { projEvts, s1, projectId } = setup()
    const archiveEvts = archiveProject(s1, projectId)
    const s2 = project([...projEvts, ...archiveEvts], baseState)
    expect(listProjects(s2, { isArchived: true }).map(p => p.id)).toContain(projectId)
  })
})
