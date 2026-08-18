import type { TaskJson, ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'

export interface ProcessingResult {
  actionableTasks: TaskJson[]
  projectsWithoutNext: ProjectJson[]
  tasksWaitingOnArchivedProjects: TaskJson[]
}

export function useProcessing(): ProcessingResult {
  const raw = useRunQuery({ kind: 'processing' })
  return raw as unknown as ProcessingResult
}
