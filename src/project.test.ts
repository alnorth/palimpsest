import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { createSphere, createProject, archiveProject, unarchiveProject } from './commands.js'
import { listProjects } from './query.js'
import type { SphereId, ProjectId } from './ids.js'

function setup() {
  const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
  const s1 = project(sphereEvts)
  const sphereId = (sphereEvts[0] as any).sphereId as SphereId

  const projEvts = createProject(s1, { sphereId, name: 'Project A' })
  const s2 = project([...sphereEvts, ...projEvts])
  const projectId = (projEvts[0] as any).projectId as ProjectId

  return { sphereEvts, projEvts, s2, projectId }
}

describe('archiveProject', () => {
  it('sets isArchived and archivedAt', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const archiveEvts = archiveProject(s2, projectId)
    const s3 = project([...sphereEvts, ...projEvts, ...archiveEvts])
    const p = s3.projects.get(projectId)
    expect(p?.isArchived).toBe(true)
    expect(p?.archivedAt).toBeDefined()
  })

  it('throws if project is already archived', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const archiveEvts = archiveProject(s2, projectId)
    const s3 = project([...sphereEvts, ...projEvts, ...archiveEvts])
    expect(() => archiveProject(s3, projectId)).toThrow('already archived')
  })

  it('throws if project does not exist', () => {
    expect(() => archiveProject(createEmptyState(), 'nope' as ProjectId)).toThrow('Project not found')
  })
})

describe('unarchiveProject', () => {
  it('clears isArchived and archivedAt', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const archiveEvts = archiveProject(s2, projectId)
    const s3 = project([...sphereEvts, ...projEvts, ...archiveEvts])
    const unarchiveEvts = unarchiveProject(s3, projectId)
    const s4 = project([...sphereEvts, ...projEvts, ...archiveEvts, ...unarchiveEvts])
    expect(s4.projects.get(projectId)?.isArchived).toBeUndefined()
    expect(s4.projects.get(projectId)?.archivedAt).toBeUndefined()
  })

  it('throws if project is not archived', () => {
    const { s2, projectId } = setup()
    expect(() => unarchiveProject(s2, projectId)).toThrow('not archived')
  })
})

describe('listProjects with isArchived filter', () => {
  it('returns only active projects when isArchived is false', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const archiveEvts = archiveProject(s2, projectId)
    const s3 = project([...sphereEvts, ...projEvts, ...archiveEvts])
    expect(listProjects(s3, { isArchived: false })).toHaveLength(0)
  })

  it('returns only archived projects when isArchived is true', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const archiveEvts = archiveProject(s2, projectId)
    const s3 = project([...sphereEvts, ...projEvts, ...archiveEvts])
    expect(listProjects(s3, { isArchived: true }).map(p => p.id)).toContain(projectId)
  })
})
