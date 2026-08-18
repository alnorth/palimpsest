import type { ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { QueryResult } from './types'

export function useProject(id: string): QueryResult<ProjectJson> {
  const { raw, isLoading, error } = useRunQuery({ kind: 'project', id })
  return {
    data: raw !== undefined ? raw.project as ProjectJson : undefined,
    isLoading,
    error,
  }
}
