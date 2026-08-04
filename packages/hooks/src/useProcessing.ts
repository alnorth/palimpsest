import type { TaskJson, ProjectJson } from 'palimpsest-query'
import { useRunQuery } from './internal/useRunQuery.js'
import type { QueryResult } from './types.js'

export interface ProcessingResult {
  actionableTasks: TaskJson[]
  projectsWithoutNext: ProjectJson[]
  tasksWaitingOnArchivedProjects: TaskJson[]
}

export function useProcessing(): QueryResult<ProcessingResult> {
  const { raw, isLoading, error } = useRunQuery({ kind: 'processing' })
  return {
    data: raw !== undefined ? raw as unknown as ProcessingResult : undefined,
    isLoading,
    error,
  }
}
