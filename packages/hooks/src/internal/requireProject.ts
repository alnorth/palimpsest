import type { ProjectionState, Project, ProjectId } from '@alnorth/palimpsest'
import { getProject } from '@alnorth/palimpsest'

export function requireProject(projState: ProjectionState, projectId: string): Project {
  const project = getProject(projState, projectId as ProjectId)
  if (project === undefined) throw new Error(`Project not found: ${projectId}`)
  return project
}
