import type { TaskJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery.js'
import type { QueryResult } from './types.js'

export function useTask(id: string): QueryResult<TaskJson> {
  const { raw, isLoading, error } = useRunQuery({ kind: 'task', id })
  return {
    data: raw !== undefined ? raw.task as TaskJson : undefined,
    isLoading,
    error,
  }
}
